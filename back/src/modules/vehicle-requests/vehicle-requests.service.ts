import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleRequest, VehicleRequestStatus } from './entities/vehicle-request.entity';
import { VehicleRequestApplication, ApplicationStatus } from './entities/vehicle-request-application.entity';
import { Driver, DriverType, DriverApprovalStatus, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { CreateVehicleRequestDto, ApplyToRequestDto } from './dto/create-vehicle-request.dto';
import { FareService } from '../fare/fare.service';
import { EventsGateway } from '../gateway/events.gateway';

const RADIUS_EXPANSION_KM = 2;
const RADIUS_EXPANSION_INTERVAL_H = 1;
const MAX_RADIUS_KM = 20;

@Injectable()
export class VehicleRequestsService {
  constructor(
    @InjectRepository(VehicleRequest)
    private requestsRepo: Repository<VehicleRequest>,
    @InjectRepository(VehicleRequestApplication)
    private applicationsRepo: Repository<VehicleRequestApplication>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleAssignment)
    private assignmentsRepo: Repository<VehicleAssignment>,
    private fareService: FareService,
    private gateway: EventsGateway,
  ) {}

  async create(userId: string, dto: CreateVehicleRequestDto) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
      relations: ['user'],
    });
    if (!owner) throw new ForbiddenException('Solo los conductores-dueños pueden publicar solicitudes');
    if (owner.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para publicar solicitudes');
    }

    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: dto.vehicle_id, owner: { id: owner.id } },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');
    if (vehicle.approval_status !== VehicleApprovalStatus.APPROVED) {
      throw new BadRequestException('El vehículo debe estar aprobado para publicar solicitudes');
    }

    const existing = await this.requestsRepo.findOne({
      where: { vehicle: { id: dto.vehicle_id }, status: VehicleRequestStatus.OPEN },
    });
    if (existing) throw new ConflictException('Ya tienes una solicitud abierta para este vehículo');

    const request = await this.requestsRepo.save(
      this.requestsRepo.create({
        vehicle,
        owner,
        notes: dto.notes,
        lat: dto.lat ?? (owner.current_lat as any),
        lng: dto.lng ?? (owner.current_lng as any),
        needed_from: dto.needed_from ? new Date(dto.needed_from) : undefined,
        needed_until: dto.needed_until ? new Date(dto.needed_until) : undefined,
      }),
    );

    return { message: 'Solicitud publicada. Los conductores cercanos podrán postularse.', request_id: request.id };
  }

  async apply(requestId: string, userId: string, dto: ApplyToRequestDto) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.DRIVER },
    });
    if (!driver) throw new ForbiddenException('Solo conductores regulares pueden postularse');
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para postularte');
    }

    const request = await this.requestsRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== VehicleRequestStatus.OPEN) {
      throw new BadRequestException('Esta solicitud ya no está disponible');
    }

    const alreadyApplied = await this.applicationsRepo.findOne({
      where: { request: { id: requestId }, driver: { id: driver.id } },
    });
    if (alreadyApplied) throw new ConflictException('Ya te postulaste a esta solicitud');

    const application = await this.applicationsRepo.save(
      this.applicationsRepo.create({ request, driver, message: dto.message }),
    );

    return {
      message: 'Te postulaste correctamente. El dueño revisará tu perfil y te contactará.',
      application_id: application.id,
    };
  }

  async withdraw(applicationId: string, userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const app = await this.applicationsRepo.findOne({
      where: { id: applicationId, driver: { id: driver.id } },
    });
    if (!app) throw new NotFoundException('Postulación no encontrada');
    if (app.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('Solo puedes retirar postulaciones pendientes');
    }

    await this.applicationsRepo.update(applicationId, { status: ApplicationStatus.WITHDRAWN });
    return { message: 'Postulación retirada' };
  }

  async listApplications(requestId: string, userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new ForbiddenException('Solo para conductores-dueños');

    const request = await this.requestsRepo.findOne({
      where: { id: requestId, owner: { id: owner.id } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o no te pertenece');

    return this.applicationsRepo.find({
      where: { request: { id: requestId }, status: ApplicationStatus.PENDING },
      relations: ['driver', 'driver.user'],
      order: { created_at: 'ASC' },
    });
  }

  async acceptApplication(requestId: string, applicationId: string, userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
      relations: ['user'],
    });
    if (!owner) throw new ForbiddenException('Solo para conductores-dueños');

    const request = await this.requestsRepo.findOne({
      where: { id: requestId, owner: { id: owner.id } },
      relations: ['vehicle'],
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o no te pertenece');
    if (request.status !== VehicleRequestStatus.OPEN) {
      throw new BadRequestException('Esta solicitud ya no está abierta');
    }

    const application = await this.applicationsRepo.findOne({
      where: { id: applicationId, request: { id: requestId } },
      relations: ['driver', 'driver.user'],
    });
    if (!application) throw new NotFoundException('Postulación no encontrada');
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('Esta postulación ya no está pendiente');
    }

    await this.applicationsRepo.update(applicationId, { status: ApplicationStatus.ACCEPTED });
    await this.applicationsRepo
      .createQueryBuilder()
      .update()
      .set({ status: ApplicationStatus.REJECTED })
      .where('request_id = :requestId AND id != :appId AND status = :status', {
        requestId,
        appId: applicationId,
        status: ApplicationStatus.PENDING,
      })
      .execute();

    await this.requestsRepo.update(requestId, {
      status: VehicleRequestStatus.ACCEPTED,
      accepted_driver: application.driver,
      accepted_at: new Date(),
    });

    await this.assignmentsRepo.save(
      this.assignmentsRepo.create({
        vehicle: request.vehicle,
        driver: application.driver,
        assigned_by: owner.user,
        status: AssignmentStatus.ACTIVE,
        assigned_at: new Date(),
      }),
    );

    await this.driversRepo.update(application.driver.id, {
      online_status: DriverOnlineStatus.LOOKING_FOR_WORK,
    });

    this.gateway.notifyDriver(application.driver.id, 'driver.assignment_created', {
      driver_id: application.driver.id,
      vehicle_id: request.vehicle.id,
      vehicle_plate: request.vehicle.plate,
      owner_name: owner.full_name,
    });

    return {
      message: `Aceptaste a ${application.driver.full_name}. Ya puede iniciar jornada con tu vehículo.`,
      driver_phone: application.driver.user?.phone ?? null,
    };
  }

  async listOpen(userId: string, page = 1, limit = 20) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.DRIVER },
    });
    if (!driver) throw new ForbiddenException('Solo conductores regulares pueden ver solicitudes');

    const [items, total] = await this.requestsRepo.findAndCount({
      where: { status: VehicleRequestStatus.OPEN },
      relations: ['vehicle', 'vehicle.cooperative', 'owner', 'owner.user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const requestIds = items.map((r) => r.id);
    const myApps = requestIds.length
      ? await this.applicationsRepo.find({
          where: requestIds.map((rid) => ({ request: { id: rid }, driver: { id: driver.id } })),
          select: ['id', 'status'],
          relations: ['request'],
        })
      : [];

    const appByRequestId = new Map(myApps.map((a) => [a.request.id, a]));

    const itemsWithApps = items.map((r) => {
      const app = appByRequestId.get(r.id);
      return { ...r, applications: app ? [app] : [] };
    });

    return { items: itemsWithApps, total, page, limit };
  }

  async cancel(requestId: string, userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new ForbiddenException('No autorizado');

    const request = await this.requestsRepo.findOne({
      where: { id: requestId, owner: { id: owner.id } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status === VehicleRequestStatus.COMPLETED) {
      throw new BadRequestException('No se puede cancelar una solicitud completada');
    }

    await this.requestsRepo.update(requestId, { status: VehicleRequestStatus.CANCELLED });
    return { message: 'Solicitud cancelada' };
  }

  async complete(requestId: string, userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new ForbiddenException('No autorizado');

    const request = await this.requestsRepo.findOne({
      where: { id: requestId, owner: { id: owner.id } },
      relations: ['accepted_driver', 'vehicle'],
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== VehicleRequestStatus.ACCEPTED) {
      throw new BadRequestException('Solo se pueden completar solicitudes aceptadas');
    }

    await this.requestsRepo.update(requestId, { status: VehicleRequestStatus.COMPLETED });

    if (request.accepted_driver) {
      const assignment = await this.assignmentsRepo.findOne({
        where: {
          driver: { id: request.accepted_driver.id },
          vehicle: { id: request.vehicle?.id },
          status: AssignmentStatus.ACTIVE,
        },
      });
      if (assignment) {
        await this.assignmentsRepo.update(assignment.id, {
          status: AssignmentStatus.INACTIVE,
          unassigned_at: new Date(),
        });
      }
      await this.driversRepo.update(request.accepted_driver.id, {
        online_status: DriverOnlineStatus.LOOKING_FOR_WORK,
        active_vehicle: null,
      });
    }

    return { message: 'Trabajo completado.' };
  }

  async getMyRequests(userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new ForbiddenException('Solo para conductores-dueños');

    return this.requestsRepo.find({
      where: { owner: { id: owner.id } },
      relations: ['vehicle', 'accepted_driver'],
      order: { created_at: 'DESC' },
    });
  }

  async getMyApplications(userId: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.DRIVER },
    });
    if (!driver) throw new ForbiddenException('Solo para conductores regulares');

    return this.applicationsRepo.find({
      where: { driver: { id: driver.id } },
      relations: ['request', 'request.vehicle', 'request.owner', 'request.owner.user'],
      order: { created_at: 'DESC' },
    });
  }

  private async expandStaleRadii() {
    const cutoff = new Date(Date.now() - RADIUS_EXPANSION_INTERVAL_H * 3600 * 1000);
    const stale = await this.requestsRepo
      .createQueryBuilder('r')
      .leftJoin('vehicle_request_applications', 'a', 'a.request_id = r.id AND a.status = :pending', {
        pending: ApplicationStatus.PENDING,
      })
      .where('r.status = :open', { open: VehicleRequestStatus.OPEN })
      .andWhere('r.created_at < :cutoff', { cutoff })
      .andWhere('(r.radius_expanded_at IS NULL OR r.radius_expanded_at < :cutoff)', { cutoff })
      .andWhere('r.search_radius_km < :max', { max: MAX_RADIUS_KM })
      .andWhere('a.id IS NULL')
      .getMany();

    for (const r of stale) {
      const newRadius = Math.min(parseFloat(r.search_radius_km as any) + RADIUS_EXPANSION_KM, MAX_RADIUS_KM);
      await this.requestsRepo.update(r.id, {
        search_radius_km: newRadius,
        radius_expanded_at: new Date(),
      });
    }
  }
}
