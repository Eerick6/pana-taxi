import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TripsService } from './trips.service';
import { Trip, TripStatus, FareMode, TripSource } from './entities/trip.entity';
import { TripOffer } from './entities/trip-offer.entity';
import { Driver, DriverApprovalStatus, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { SystemConfig } from '../platform/entities/system-config.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Stand } from '../stands/entities/stand.entity';
import { StandAssignment } from '../stands/entities/stand-assignment.entity';
import { WalletService } from '../wallet/wallet.service';
import { EventsGateway } from '../gateway/events.gateway';
import { FareService } from '../fare/fare.service';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountingService } from '../accounting/accounting.service';

// ── Query-builder factory ──────────────────────────────────────────────────
function makeQb(result: [any[], number] = [[], 0]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result[0]),
  };
  return qb;
}

function makeRepo<T = any>() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((dto: any) => dto),
    findAndCount: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
  };
}

describe('TripsService', () => {
  let service: TripsService;
  let tripsRepo: ReturnType<typeof makeRepo<Trip>>;
  let driversRepo: ReturnType<typeof makeRepo<Driver>>;
  let dataSource: { transaction: jest.Mock };
  let driversService: { getCachedDriverWithVehicle: jest.Mock };
  let gateway: any;
  let fareService: any;
  let standAssignmentsRepo: ReturnType<typeof makeRepo<StandAssignment>>;

  beforeEach(async () => {
    tripsRepo = makeRepo<Trip>();
    driversRepo = makeRepo<Driver>();
    standAssignmentsRepo = makeRepo<StandAssignment>();

    // Stand assignments query builder used for auto-checkout
    const standQb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    standAssignmentsRepo.createQueryBuilder.mockReturnValue(standQb);

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn(),
          update: jest.fn(),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(em);
      }),
    };

    gateway = {
      notifyNewTrip: jest.fn(),
      notifyDriver: jest.fn(),
      notifyUser: jest.fn(),
      notifyCoop: jest.fn(),
      notifyTripUpdate: jest.fn(),
    };

    fareService = {
      getConfig: jest.fn().mockResolvedValue({
        location_update_interval_sec: 5,
        location_interval_trip_sec: 5,
        location_interval_fleet_sec: 10,
        search_radius_km: 3,
        base_fare: 1.5,
        minimum_fare: 2.0,
        max_negotiation_discount_pct: 20,
      }),
      estimateFare: jest.fn().mockResolvedValue({
        total: 5.0,
        distance_km: 3,
        duration_min: 10,
        is_night_rate: false,
        route_geometry: null,
      }),
      haversineDistance: jest.fn().mockReturnValue(1),
      updateMeter: jest.fn().mockReturnValue(2.5),
    };

    driversService = { getCachedDriverWithVehicle: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
        { provide: getRepositoryToken(TripOffer), useValue: makeRepo() },
        { provide: getRepositoryToken(Driver), useValue: driversRepo },
        { provide: getRepositoryToken(Vehicle), useValue: makeRepo() },
        { provide: getRepositoryToken(VehicleAssignment), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeOwner), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeMember), useValue: makeRepo() },
        { provide: getRepositoryToken(SystemConfig), useValue: makeRepo() },
        { provide: getRepositoryToken(DriverWallet), useValue: makeRepo() },
        { provide: getRepositoryToken(Stand), useValue: makeRepo() },
        { provide: getRepositoryToken(StandAssignment), useValue: standAssignmentsRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: WalletService, useValue: { deductCommission: jest.fn() } },
        { provide: EventsGateway, useValue: gateway },
        { provide: FareService, useValue: fareService },
        { provide: DriversService, useValue: driversService },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
        { provide: AccountingService, useValue: { creditCoopCommission: jest.fn() } },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────────
  // listTrips
  // ─────────────────────────────────────────────────────────────────────────────
  describe('listTrips', () => {
    it('should filter by cooperative_id when user is COOPERATIVE_ADMIN', async () => {
      const user = {
        id: 'u1',
        role: UserRole.COOPERATIVE_ADMIN,
        cooperative_id: 'coop-111',
      } as User;

      const qb = makeQb([[{ id: 't1' }], 1]);
      tripsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listTrips(user);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'trip.cooperative_id = :coopId',
        { coopId: 'coop-111' },
      );
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it('should throw ForbiddenException when COOPERATIVE_ADMIN has no cooperative_id', async () => {
      const user = {
        id: 'u1',
        role: UserRole.COOPERATIVE_ADMIN,
        cooperative_id: undefined,
      } as User;

      const qb = makeQb();
      tripsRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.listTrips(user)).rejects.toThrow(ForbiddenException);
    });

    it('should NOT filter by cooperative when user is PLATFORM_ADMIN', async () => {
      const user = {
        id: 'u-admin',
        role: UserRole.PLATFORM_ADMIN,
      } as User;

      const allTrips = [{ id: 't1' }, { id: 't2' }];
      const qb = makeQb([allTrips, 2]);
      tripsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listTrips(user);

      // andWhere should NOT be called with coopId filter
      const coopFilterCall = (qb.andWhere as jest.Mock).mock.calls.find(
        (call) => call[0] === 'trip.cooperative_id = :coopId',
      );
      expect(coopFilterCall).toBeUndefined();
      expect(result.total).toBe(2);
    });

    it('should apply status filter when provided', async () => {
      const user = {
        id: 'u-admin',
        role: UserRole.PLATFORM_ADMIN,
      } as User;

      const qb = makeQb([[], 0]);
      tripsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listTrips(user, TripStatus.COMPLETED);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'trip.status = :status',
        { status: TripStatus.COMPLETED },
      );
    });

    it('should also filter for COOPERATIVE_OPERATOR', async () => {
      const user = {
        id: 'u2',
        role: UserRole.COOPERATIVE_OPERATOR,
        cooperative_id: 'coop-222',
      } as User;

      const qb = makeQb([[{ id: 't5' }], 1]);
      tripsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listTrips(user);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'trip.cooperative_id = :coopId',
        { coopId: 'coop-222' },
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // acceptTrip (METER mode)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('acceptTrip (METER mode)', () => {
    const userId = 'user-driver-1';
    const tripId = 'trip-meter-1';

    const mockDriver = {
      id: 'driver-1',
      approval_status: DriverApprovalStatus.APPROVED,
      online_status: DriverOnlineStatus.ONLINE,
      user: { id: userId },
    } as Driver;

    const mockMeterTrip = {
      id: tripId,
      fare_mode: FareMode.METER,
      status: TripStatus.REQUESTED,
      cooperative: null,
      client: null,
    } as unknown as Trip;

    beforeEach(() => {
      driversRepo.findOne.mockResolvedValue(mockDriver);
    });

    it('should throw ConflictException when driver already has an active trip', async () => {
      // Each acceptTrip call: preCheck (index 0), then active-trip check (index 1)
      tripsRepo.findOne
        .mockResolvedValueOnce(mockMeterTrip)       // 1st call: preCheck
        .mockResolvedValueOnce({ id: 'active-trip' }); // 2nd call: active trip guard

      const err = await service.acceptTrip(tripId, userId).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('Ya tienes un viaje activo');
    });

    it('should call driversService.getCachedDriverWithVehicle for vehicle check', async () => {
      // No active trip
      tripsRepo.findOne
        .mockResolvedValueOnce(mockMeterTrip)
        .mockResolvedValueOnce(null); // no active trip

      const mockVehicle = {
        id: 'v1',
        approval_status: VehicleApprovalStatus.APPROVED,
        cooperative: null,
      } as Vehicle;

      driversService.getCachedDriverWithVehicle.mockResolvedValue({
        active_vehicle: mockVehicle,
      });

      // Set up transaction em
      dataSource.transaction.mockImplementationOnce(async (cb) => {
        const em = {
          findOne: jest.fn()
            .mockResolvedValueOnce({ ...mockMeterTrip }) // trip with lock
            .mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(em);
      });

      // standAssignmentsRepo qb (auto-checkout)
      const standQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      standAssignmentsRepo.createQueryBuilder.mockReturnValue(standQb);

      await service.acceptTrip(tripId, userId);

      expect(driversService.getCachedDriverWithVehicle).toHaveBeenCalledWith(mockDriver.id);
    });

    it('should throw NotFoundException when trip does not exist', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(null); // preCheck fails

      await expect(service.acceptTrip(tripId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when driver is not approved', async () => {
      driversRepo.findOne.mockResolvedValue({
        ...mockDriver,
        approval_status: DriverApprovalStatus.PENDING,
      });

      await expect(service.acceptTrip(tripId, userId)).rejects.toThrow(ForbiddenException);
    });
  });
});
