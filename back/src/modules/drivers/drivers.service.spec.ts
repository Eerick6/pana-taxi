import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { DriversService } from './drivers.service';
import { Driver, DriverApprovalStatus, DriverType, DriverOnlineStatus } from './entities/driver.entity';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleDocument } from '../vehicles/entities/vehicle-document.entity';
import { Trip } from '../trips/entities/trip.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { StorageService } from '../storage/storage.service';
import { TermsService } from '../terms/terms.service';
import { FareService } from '../fare/fare.service';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

function makeRepo<T = any>() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((dto: any) => dto),
    findAndCount: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };
}

describe('DriversService', () => {
  let service: DriversService;
  let driversRepo: ReturnType<typeof makeRepo<Driver>>;
  let vehiclesRepo: ReturnType<typeof makeRepo<Vehicle>>;
  let assignmentsRepo: ReturnType<typeof makeRepo<VehicleAssignment>>;
  let fareService: { getConfig: jest.Mock };

  beforeEach(async () => {
    driversRepo = makeRepo<Driver>();
    vehiclesRepo = makeRepo<Vehicle>();
    assignmentsRepo = makeRepo<VehicleAssignment>();
    fareService = {
      getConfig: jest.fn().mockResolvedValue({
        location_interval_fleet_sec: 10,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: getRepositoryToken(User), useValue: makeRepo() },
        { provide: getRepositoryToken(Driver), useValue: driversRepo },
        { provide: getRepositoryToken(DriverDocument), useValue: makeRepo() },
        { provide: getRepositoryToken(DriverWallet), useValue: makeRepo() },
        { provide: getRepositoryToken(Cooperative), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeOwner), useValue: makeRepo() },
        { provide: getRepositoryToken(CooperativeMember), useValue: makeRepo() },
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepo },
        { provide: getRepositoryToken(VehicleDocument), useValue: makeRepo() },
        { provide: getRepositoryToken(Trip), useValue: makeRepo() },
        { provide: getRepositoryToken(VehicleAssignment), useValue: assignmentsRepo },
        { provide: StorageService, useValue: { upload: jest.fn(), getPresignedUrl: jest.fn() } },
        { provide: TermsService, useValue: { validateAcceptance: jest.fn() } },
        { provide: FareService, useValue: fareService },
        { provide: EventsGateway, useValue: { notifyDriver: jest.fn(), syncAvailableRoom: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn().mockResolvedValue(undefined) } },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────────
  // startDay
  // ─────────────────────────────────────────────────────────────────────────────
  describe('startDay', () => {
    const userId = 'user-driver-1';

    const approvedOwnerDriver = {
      id: 'driver-1',
      driver_type: DriverType.OWNER_DRIVER,
      approval_status: DriverApprovalStatus.APPROVED,
      active_vehicle: null,
    } as unknown as Driver;

    const approvedRegularDriver = {
      id: 'driver-2',
      driver_type: DriverType.DRIVER,
      approval_status: DriverApprovalStatus.APPROVED,
      active_vehicle: null,
    } as unknown as Driver;

    const mockVehicle = {
      id: 'vehicle-1',
      plate: 'ABC-123',
      approval_status: VehicleApprovalStatus.APPROVED,
    } as unknown as Vehicle;

    it('should throw NotFoundException when driver profile does not exist', async () => {
      driversRepo.findOne.mockResolvedValue(null);

      await expect(service.startDay(userId, 'vehicle-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when driver is not approved', async () => {
      driversRepo.findOne.mockResolvedValue({
        ...approvedOwnerDriver,
        approval_status: DriverApprovalStatus.PENDING,
      });

      await expect(service.startDay(userId, 'vehicle-1')).rejects.toThrow(ForbiddenException);
      await expect(service.startDay(userId, 'vehicle-1')).rejects.toThrow('aprobado');
    });

    it('should throw BadRequestException when OWNER_DRIVER does not provide vehicleId', async () => {
      driversRepo.findOne.mockResolvedValue(approvedOwnerDriver);

      await expect(service.startDay(userId)).rejects.toThrow(BadRequestException);
    });

    // ── OWNER_DRIVER: taxi already in use by another driver ──────────────────

    it('should throw ConflictException with "jornada activa" when another driver is online with same vehicle (OWNER_DRIVER)', async () => {
      driversRepo.findOne
        .mockResolvedValueOnce(approvedOwnerDriver) // first call: find the driver by userId
        .mockResolvedValueOnce({                    // second call: taxiEnUso check
          id: 'other-driver',
          online_status: DriverOnlineStatus.ONLINE,
        });

      vehiclesRepo.findOne.mockResolvedValue(mockVehicle);

      const error = await service.startDay(userId, mockVehicle.id).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/jornada activa/i);
    });

    it('should NOT throw when the same driver is already assigned to the vehicle (OWNER_DRIVER)', async () => {
      // taxiEnUso returns the same driver (id matches)
      driversRepo.findOne
        .mockResolvedValueOnce(approvedOwnerDriver)
        .mockResolvedValueOnce({ id: approvedOwnerDriver.id, online_status: DriverOnlineStatus.ONLINE })
        .mockResolvedValueOnce({ ...approvedOwnerDriver, active_vehicle: mockVehicle }); // updatedDriver

      vehiclesRepo.findOne.mockResolvedValue(mockVehicle);
      driversRepo.update.mockResolvedValue(undefined);

      const result = await service.startDay(userId, mockVehicle.id);

      expect(result).toHaveProperty('message', 'Jornada iniciada. Ya puedes recibir viajes.');
    });

    // ── DRIVER (chofer): taxi already in use ─────────────────────────────────

    it('should throw ConflictException when vehicle is in use by another driver (DRIVER type)', async () => {
      driversRepo.findOne
        .mockResolvedValueOnce(approvedRegularDriver) // find driver
        .mockResolvedValueOnce({                      // taxiEnUso — different driver
          id: 'some-other-driver',
          online_status: DriverOnlineStatus.ONLINE,
        });

      assignmentsRepo.findOne.mockResolvedValue({
        status: AssignmentStatus.ACTIVE,
        vehicle: mockVehicle,
      });

      const error = await service.startDay(userId).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/jornada activa/i);
    });

    it('should throw ForbiddenException when DRIVER has no active assignment', async () => {
      driversRepo.findOne.mockResolvedValue(approvedRegularDriver);
      assignmentsRepo.findOne.mockResolvedValue(null);

      await expect(service.startDay(userId)).rejects.toThrow(ForbiddenException);
    });

    it('should succeed and return success message when no conflict (OWNER_DRIVER)', async () => {
      driversRepo.findOne
        .mockResolvedValueOnce(approvedOwnerDriver) // initial fetch
        .mockResolvedValueOnce(null)                // taxiEnUso: no one else online
        .mockResolvedValueOnce({ ...approvedOwnerDriver, active_vehicle: mockVehicle }); // updatedDriver

      vehiclesRepo.findOne.mockResolvedValue(mockVehicle);
      driversRepo.update.mockResolvedValue(undefined);

      const result = await service.startDay(userId, mockVehicle.id);

      expect(driversRepo.update).toHaveBeenCalledWith(
        approvedOwnerDriver.id,
        expect.objectContaining({
          active_vehicle: mockVehicle,
          online_status: DriverOnlineStatus.ONLINE,
        }),
      );
      expect(result.vehicle_plate).toBe(mockVehicle.plate);
      expect(result.online_status).toBe(DriverOnlineStatus.ONLINE);
    });

    it('should succeed and return success message when no conflict (regular DRIVER)', async () => {
      driversRepo.findOne
        .mockResolvedValueOnce(approvedRegularDriver)
        .mockResolvedValueOnce(null)                 // taxiEnUso: nobody else
        .mockResolvedValueOnce({ ...approvedRegularDriver, active_vehicle: mockVehicle }); // updatedDriver

      assignmentsRepo.findOne.mockResolvedValue({
        status: AssignmentStatus.ACTIVE,
        vehicle: mockVehicle,
      });
      driversRepo.update.mockResolvedValue(undefined);

      const result = await service.startDay(userId);

      expect(result.message).toBe('Jornada iniciada. Ya puedes recibir viajes.');
    });
  });
});
