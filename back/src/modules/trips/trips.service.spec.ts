import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TripsService } from './trips.service';
import { Trip, TripStatus, FareMode, TripSource, CancelledBy } from './entities/trip.entity';
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
import { Client } from '../clients/entities/client.entity';
import { PaymentMethod } from '../payment-methods/entities/payment-method.entity';
import { Rating } from '../ratings/entities/rating.entity';
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
    leftJoin: jest.fn().mockReturnThis(),
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
  let walletRepo: ReturnType<typeof makeRepo<DriverWallet>>;
  let tripOffersRepo: ReturnType<typeof makeRepo<TripOffer>>;
  let dataSource: { transaction: jest.Mock };
  let driversService: { getCachedDriverWithVehicle: jest.Mock };
  let gateway: any;
  let fareService: any;
  let standAssignmentsRepo: ReturnType<typeof makeRepo<StandAssignment>>;

  beforeEach(async () => {
    tripsRepo = makeRepo<Trip>();
    driversRepo = makeRepo<Driver>();
    walletRepo = makeRepo<DriverWallet>();
    tripOffersRepo = makeRepo<TripOffer>();
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
      notifyAvailableDrivers: jest.fn(),
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
        { provide: getRepositoryToken(TripOffer), useValue: tripOffersRepo },
        { provide: getRepositoryToken(Driver), useValue: driversRepo },
        { provide: getRepositoryToken(Vehicle), useValue: makeRepo() },
        { provide: getRepositoryToken(VehicleAssignment), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeOwner), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeMember), useValue: makeRepo() },
        { provide: getRepositoryToken(SystemConfig), useValue: makeRepo() },
        { provide: getRepositoryToken(DriverWallet), useValue: walletRepo },
        { provide: getRepositoryToken(Stand), useValue: makeRepo() },
        { provide: getRepositoryToken(StandAssignment), useValue: standAssignmentsRepo },
        { provide: getRepositoryToken(Client), useValue: makeRepo() },
        { provide: getRepositoryToken(PaymentMethod), useValue: makeRepo() },
        { provide: getRepositoryToken(Rating), useValue: makeRepo() },
        { provide: DataSource, useValue: dataSource },
        { provide: WalletService, useValue: { deductCommission: jest.fn(), creditCardEarning: jest.fn() } },
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
        '(trip.cooperative_id = :coopId OR vehicleCoop.id = :coopId OR driverMember.cooperative_id = :coopId)',
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
        '(trip.cooperative_id = :coopId OR vehicleCoop.id = :coopId OR driverMember.cooperative_id = :coopId)',
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
      // METER/NEGOTIATED trips delegate straight to makeOffer(): preCheck (index 0),
      // then makeOffer's own active-trip guard (index 1).
      tripsRepo.findOne
        .mockResolvedValueOnce(mockMeterTrip)          // 1st call: acceptTrip preCheck
        .mockResolvedValueOnce({ id: 'active-trip' }); // 2nd call: makeOffer active-trip guard

      const err = await service.acceptTrip(tripId, userId).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('No puedes hacer ofertas mientras tienes un viaje activo');
    });

    it('should call driversService.getCachedDriverWithVehicle for vehicle check', async () => {
      // acceptTrip on a METER trip delegates to makeOffer(), which looks up:
      // 1) preCheck (acceptTrip), 2) active-trip guard, 3) the trip again with relations.
      tripsRepo.findOne
        .mockResolvedValueOnce(mockMeterTrip)
        .mockResolvedValueOnce(null) // no active trip
        .mockResolvedValueOnce({ ...mockMeterTrip, client: null });

      tripOffersRepo.count.mockResolvedValue(0);
      tripOffersRepo.findOne.mockResolvedValue(null); // no existing pending offer
      tripOffersRepo.save.mockResolvedValue({ id: 'offer-1' });

      const mockVehicle = {
        id: 'v1',
        approval_status: VehicleApprovalStatus.APPROVED,
        cooperative: null,
      } as Vehicle;

      driversService.getCachedDriverWithVehicle.mockResolvedValue({
        active_vehicle: mockVehicle,
      });

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

  // ─────────────────────────────────────────────────────────────────────────────
  // startTrip
  // ─────────────────────────────────────────────────────────────────────────────
  describe('startTrip', () => {
    const userId = 'user-driver-1';
    const tripId = 'trip-1';
    const mockDriver = { id: 'driver-1', user: { id: userId } } as Driver;

    beforeEach(() => {
      driversRepo.findOne.mockResolvedValue(mockDriver);
    });

    function mockTx(trip: any, update = jest.fn().mockResolvedValue(undefined)) {
      dataSource.transaction.mockImplementationOnce(async (cb: any) =>
        cb({ findOne: jest.fn().mockResolvedValue(trip), update }),
      );
      return update;
    }

    it('should throw NotFoundException when the trip does not belong to the driver', async () => {
      mockTx(null);
      await expect(
        service.startTrip(tripId, userId, { otp_code: '1234' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when the trip is not ACCEPTED or DRIVER_ARRIVED', async () => {
      mockTx({ id: tripId, status: TripStatus.IN_PROGRESS, otp_code: '1234' });
      await expect(
        service.startTrip(tripId, userId, { otp_code: '1234' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('regression: must deny by default when trip.otp_code is null, not accept any code', async () => {
      // This is the exact fail-open bug that shipped: a null otp_code used to
      // skip validation entirely and accept any 4-6 char string.
      mockTx({ id: tripId, status: TripStatus.ACCEPTED, otp_code: null });
      const err = await service
        .startTrip(tripId, userId, { otp_code: 'anything' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
    });

    it('should throw BadRequestException when the otp_code does not match', async () => {
      mockTx({ id: tripId, status: TripStatus.ACCEPTED, otp_code: '1234' });
      await expect(
        service.startTrip(tripId, userId, { otp_code: '9999' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should start the trip, clear the otp_code, and notify when the code matches', async () => {
      const update = mockTx({ id: tripId, status: TripStatus.DRIVER_ARRIVED, otp_code: '1234' });

      const result = await service.startTrip(tripId, userId, { otp_code: '1234' });

      expect(update).toHaveBeenCalledWith(
        Trip,
        tripId,
        expect.objectContaining({ status: TripStatus.IN_PROGRESS, otp_code: null }),
      );
      expect(gateway.notifyTripUpdate).toHaveBeenCalledWith(
        tripId,
        'trip.started',
        expect.objectContaining({ status: TripStatus.IN_PROGRESS }),
        undefined,
      );
      expect(result.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // completeTrip
  // ─────────────────────────────────────────────────────────────────────────────
  describe('completeTrip', () => {
    const userId = 'user-driver-1';
    const tripId = 'trip-1';
    const mockDriver = { id: 'driver-1', user: { id: userId } } as Driver;

    beforeEach(() => {
      driversRepo.findOne.mockResolvedValue(mockDriver);
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          update: jest.fn().mockResolvedValue(undefined),
          findOne: jest.fn(),
          createQueryBuilder: jest.fn(),
        }),
      );
    });

    it('should throw BadRequestException when the trip is not IN_PROGRESS', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.ACCEPTED,
        fare_mode: FareMode.METER,
      });

      await expect(
        service.completeTrip(tripId, userId, { fare_amount: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when the driver wallet is missing', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.IN_PROGRESS,
        fare_mode: FareMode.NEGOTIATED,
        agreed_fare: '5.00',
        commission_rate: '0.10',
        cooperative: null,
      });
      walletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.completeTrip(tripId, userId, { fare_amount: 5 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should raise the fare to the configured minimum when the computed fare is lower', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.IN_PROGRESS,
        fare_mode: FareMode.METER,
        meter_amount: '1.00', // below the mocked minimum_fare of 2.0
        commission_rate: '0.10',
        cooperative: null,
      });
      walletRepo.findOne.mockResolvedValue({ id: 'wallet-1' });

      const result = await service.completeTrip(tripId, userId, { fare_amount: 1 } as any);

      expect(result.fare_amount).toBe('2.00');
      expect(result.commission_amount).toBe('0.20');
    });

    it('should complete the trip, compute the commission, and notify', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.IN_PROGRESS,
        fare_mode: FareMode.NEGOTIATED,
        agreed_fare: '10.00',
        commission_rate: '0.10',
        cooperative: null,
        payment_method: null,
      });
      walletRepo.findOne.mockResolvedValue({ id: 'wallet-1' });

      const result = await service.completeTrip(tripId, userId, { fare_amount: 10 } as any);

      expect(result.fare_amount).toBe('10.00');
      expect(result.commission_amount).toBe('1.00');
      expect(gateway.notifyTripUpdate).toHaveBeenCalledWith(
        tripId,
        'trip.completed',
        expect.objectContaining({ status: TripStatus.COMPLETED }),
        undefined,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // cancelTrip
  // ─────────────────────────────────────────────────────────────────────────────
  describe('cancelTrip', () => {
    const tripId = 'trip-1';

    beforeEach(() => {
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          update: jest.fn().mockResolvedValue(undefined),
          findOne: jest.fn(),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      );
    });

    it("should throw ForbiddenException when a client tries to cancel someone else's trip", async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.REQUESTED,
        client: { id: 'other-client' },
        driver: null,
        cooperative: null,
      });
      const user = { id: 'client-1', role: UserRole.CLIENT } as User;

      await expect(service.cancelTrip(tripId, user, {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when the trip is already finished', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.COMPLETED,
        client: { id: 'client-1' },
        driver: null,
        cooperative: null,
      });
      const user = { id: 'client-1', role: UserRole.CLIENT } as User;

      await expect(service.cancelTrip(tripId, user, {})).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when the driver tries to cancel a trip already in progress', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.IN_PROGRESS,
        client: { id: 'client-1' },
        driver: { id: 'driver-1', user: { id: 'driver-user-1' } },
        cooperative: null,
      });
      const user = { id: 'driver-user-1', role: UserRole.DRIVER } as User;

      await expect(service.cancelTrip(tripId, user, {})).rejects.toThrow(ForbiddenException);
    });

    it('should cancel the trip and notify the client and available drivers when still searching', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        status: TripStatus.REQUESTED,
        client: { id: 'client-1' },
        driver: null,
        cooperative: { id: 'coop-1' },
      });
      const user = { id: 'coop-admin-1', role: UserRole.COOPERATIVE_ADMIN } as User;

      const result = await service.cancelTrip(tripId, user, { reason: 'cliente no aparece' });

      expect(gateway.notifyTripUpdate).toHaveBeenCalledWith(
        tripId,
        'trip.cancelled',
        expect.objectContaining({ status: TripStatus.CANCELLED, cancelled_by: CancelledBy.COOPERATIVE }),
        'coop-1',
      );
      expect(gateway.notifyUser).toHaveBeenCalledWith('client-1', 'trip.cancelled', expect.any(Object));
      expect(gateway.notifyAvailableDrivers).toHaveBeenCalledWith('trip.taken', { trip_id: tripId });
      expect(result.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // selectOffer
  // ─────────────────────────────────────────────────────────────────────────────
  describe('selectOffer', () => {
    const userId = 'user-client-1';
    const tripId = 'trip-1';
    const offerId = 'offer-1';

    it('should throw ConflictException when the trip was already assigned', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        fare_mode: FareMode.NEGOTIATED,
        status: TripStatus.ACCEPTED,
      });

      await expect(service.selectOffer(tripId, offerId, userId)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when the selected driver already has an active trip', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        fare_mode: FareMode.NEGOTIATED,
        status: TripStatus.REQUESTED,
      });

      const lockedTrip = {
        id: tripId,
        status: TripStatus.REQUESTED,
        fare_mode: FareMode.NEGOTIATED,
        client_offer: '5.00',
        suggested_fare: '5.00',
      };
      const selectedOffer = {
        id: offerId,
        amount: '5.00',
        driver: { id: 'driver-2', user: { id: 'driver-user-2' } },
        vehicle: null,
      };

      dataSource.transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(lockedTrip)
            .mockResolvedValueOnce(selectedOffer)
            .mockResolvedValueOnce({ id: 'busy-trip' }),
          update: jest.fn(),
          createQueryBuilder: jest.fn(),
        }),
      );

      await expect(service.selectOffer(tripId, offerId, userId)).rejects.toThrow(ConflictException);
    });

    it('should assign the driver, generate an OTP, and notify the driver and client', async () => {
      tripsRepo.findOne.mockResolvedValue({
        id: tripId,
        fare_mode: FareMode.NEGOTIATED,
        status: TripStatus.REQUESTED,
      });

      const lockedTrip = {
        id: tripId,
        status: TripStatus.REQUESTED,
        fare_mode: FareMode.NEGOTIATED,
        client_offer: '5.00',
        suggested_fare: '5.00',
      };
      const selectedOffer = {
        id: offerId,
        amount: '5.00',
        driver: { id: 'driver-2', user: { id: 'driver-user-2' } },
        vehicle: { id: 'v1', cooperative: { id: 'coop-9' } },
      };
      const emUpdate = jest.fn().mockResolvedValue(undefined);
      const emQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      dataSource.transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(lockedTrip)
            .mockResolvedValueOnce(selectedOffer)
            .mockResolvedValueOnce(null), // driver not busy
          update: emUpdate,
          createQueryBuilder: jest.fn().mockReturnValue(emQb),
        }),
      );

      const result = await service.selectOffer(tripId, offerId, userId);

      expect(emUpdate).toHaveBeenCalledWith(
        Trip,
        tripId,
        expect.objectContaining({ status: TripStatus.ACCEPTED, driver: { id: 'driver-2' } }),
      );
      expect(gateway.notifyDriver).toHaveBeenCalledWith(
        'driver-2',
        'trip.offer_accepted',
        expect.any(Object),
      );
      expect(gateway.notifyUser).toHaveBeenCalledWith(
        userId,
        'trip.accepted',
        expect.objectContaining({ otp_code: expect.any(String) }),
      );
      expect(result.trip_id).toBe(tripId);
    });
  });
});
