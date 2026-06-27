import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleRequest, VehicleRequestStatus } from './entities/vehicle-request.entity';
import { Driver, DriverType, DriverApprovalStatus, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { CreateVehicleRequestDto } from './dto/create-vehicle-request.dto';

@Injectable()
export class VehicleRequestsService {
  constructor(
    @InjectRepository(VehicleRequest)
    private requestsRepo: Repository<VehicleRequest>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleAssignment)
    private assignmentsRepo: Repository<VehicleAssignment>,
  ) {}

  async create(userId: string, dto: CreateVehicleRequestDto) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
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
      throw new BadRequestException('El vehículo debe estar aprobado');
    }

    // Only one open request per vehicle at a time
    const existing = await this.requestsRepo.findOne({
      where: { vehicle: { id: dto.vehicle_id }, status: VehicleRequestStatus.OPEN },
    });
    if (existing) throw new BadRequestException('Ya tienes una solicitud abierta para este vehículo');

    const request = await this.requestsRepo.save(
      this.requestsRepo.create({
        vehicle,
        owner,
        notes: dto.notes,
        needed_from: dto.needed_from ? new Date(dto.needed_from) : undefined,
        needed_until: dto.needed_until ? new Date(dto.needed_until) : undefined,
      }),
    );

    return { message: 'Solicitud publicada. Los conductores disponibles podrán verla.', request_id: request.id };
  }

  async listOpen(page = 1, limit = 20) {
    // Approved drivers with LOOKING_FOR_WORK status see these
    const [items, total] = await this.requestsRepo.findAndCount({
      where: { status: VehicleRequestStatus.OPEN },
      relations: ['vehicle', 'owner', 'owner.user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async accept(requestId: string, userId: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.DRIVER },
    });
    if (!driver) throw new ForbiddenException('Solo conductores regulares aprobados pueden aceptar solicitudes');
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para aceptar solicitudes');
    }

    const request = await this.requestsRepo.findOne({
      where: { id: requestId },
      relations: ['owner'],
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== VehicleRequestStatus.OPEN) {
      throw new BadRequestException('Esta solicitud ya no está disponible');
    }

    await this.requestsRepo.update(requestId, {
      status: VehicleRequestStatus.ACCEPTED,
      accepted_by: driver,
      accepted_at: new Date(),
    });

    // Create a temporary vehicle assignment so the system knows this driver is on this vehicle
    const fullRequest = await this.requestsRepo.findOne({ where: { id: requestId }, relations: ['vehicle'] });
    await this.assignmentsRepo.save(
      this.assignmentsRepo.create({
        vehicle: fullRequest.vehicle,
        driver,
        assigned_by: request.owner.user,
        status: AssignmentStatus.ACTIVE,
        assigned_at: new Date(),
      }),
    );

    // El vehículo fue asignado — el conductor ahora debe iniciar jornada con POST /drivers/me/start-day
    await this.driversRepo.update(driver.id, { online_status: DriverOnlineStatus.LOOKING_FOR_WORK });

    return {
      message: 'Solicitud aceptada. Coordina la entrega del vehículo con el dueño y luego inicia tu jornada con POST /drivers/me/start-day',
      owner_phone: request.owner.user?.phone,
    };
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
      relations: ['accepted_by'],
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== VehicleRequestStatus.ACCEPTED) {
      throw new BadRequestException('Solo se pueden completar solicitudes aceptadas');
    }

    await this.requestsRepo.update(requestId, { status: VehicleRequestStatus.COMPLETED });

    if (request.accepted_by) {
      // Deactivate the temporary vehicle assignment
      const assignment = await this.assignmentsRepo.findOne({
        where: {
          driver: { id: request.accepted_by.id },
          vehicle: { id: request.vehicle?.id },
          status: AssignmentStatus.ACTIVE,
        },
        relations: ['vehicle'],
      });
      if (assignment) {
        await this.assignmentsRepo.update(assignment.id, {
          status: AssignmentStatus.INACTIVE,
          unassigned_at: new Date(),
        });
      }

      await this.driversRepo.update(request.accepted_by.id, {
        online_status: DriverOnlineStatus.LOOKING_FOR_WORK,
        active_vehicle: null,
      });
    }

    return { message: 'Trabajo completado. Ya puedes calificar al conductor en POST /ratings' };
  }

  async getMyRequests(userId: string) {
    const owner = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new ForbiddenException('Solo para conductores-dueños');

    return this.requestsRepo.find({
      where: { owner: { id: owner.id } },
      relations: ['vehicle', 'accepted_by'],
      order: { created_at: 'DESC' },
    });
  }

  async getMyAccepted(userId: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId }, driver_type: DriverType.DRIVER },
    });
    if (!driver) throw new ForbiddenException('Solo para conductores regulares');

    return this.requestsRepo.find({
      where: { accepted_by: { id: driver.id } },
      relations: ['vehicle', 'owner', 'owner.user'],
      order: { created_at: 'DESC' },
    });
  }
}
