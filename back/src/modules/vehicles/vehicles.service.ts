import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Vehicle, VehicleApprovalStatus, VehicleStatus } from './entities/vehicle.entity';
import { VehicleDocument, VehicleDocumentType } from './entities/vehicle-document.entity';
import { Driver, DriverType, DriverApprovalStatus } from '../drivers/entities/driver.entity';
import { Cooperative, CooperativeStatus } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { DocumentStatus } from '../drivers/entities/driver-document.entity';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterVehicleDto } from './dto/register-vehicle.dto';
import { UploadVehicleDocumentDto } from './dto/upload-vehicle-document.dto';
import { RejectVehicleDto } from './dto/reject-vehicle.dto';
import { RejectDocumentDto } from '../drivers/dto/reject-document.dto';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleDocument)
    private vehicleDocsRepo: Repository<VehicleDocument>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Cooperative)
    private cooperativesRepo: Repository<Cooperative>,
    @InjectRepository(CooperativeOwner)
    private cooperativeOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(CooperativeMember)
    private coopMembersRepo: Repository<CooperativeMember>,
    private storage: StorageService,
    private gateway: EventsGateway,
    private notifications: NotificationsService,
  ) {}

  async registerVehicle(userId: string, dto: RegisterVehicleDto) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.driver_type !== DriverType.OWNER_DRIVER) {
      throw new ForbiddenException('Solo los conductores-dueños pueden registrar vehículos');
    }
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('La plataforma debe aprobar tus documentos antes de registrar un vehículo');
    }

    const cooperative = await this.cooperativesRepo.findOne({ where: { id: dto.cooperative_id } });
    if (!cooperative) throw new NotFoundException('Cooperativa no encontrada');
    if (cooperative.status !== CooperativeStatus.ACTIVE) {
      throw new BadRequestException('La cooperativa está suspendida');
    }

    // Verificar membresía: si no existe, auto-unirse (pending); si fue rechazada, bloquear
    let membership = await this.cooperativeOwnersRepo.findOne({
      where: { owner: { id: driver.id }, cooperative: { id: dto.cooperative_id } },
    });
    if (membership?.approval_status === OwnerApprovalStatus.REJECTED) {
      throw new ForbiddenException('Tu solicitud de membresía en esta cooperativa fue rechazada');
    }
    if (!membership) {
      membership = await this.cooperativeOwnersRepo.save(
        this.cooperativeOwnersRepo.create({ owner: driver, cooperative }),
      );
    }
    // Si la membresía está pendiente o aprobada se permite registrar el vehículo

    const plateExists = await this.vehiclesRepo.findOne({ where: { plate: dto.plate } });
    if (plateExists) throw new ConflictException('Placa ya registrada en el sistema');

    const vehicle = await this.vehiclesRepo.save(
      this.vehiclesRepo.create({
        cooperative,
        owner: driver,
        plate: dto.plate,
        brand: dto.brand,
        model: dto.model,
        color: dto.color,
        year: dto.year,
      }),
    );

    this.notifyCoopAdmins(cooperative.id, {
      title: 'Nuevo taxi registrado',
      body: `${driver.full_name} registró un nuevo vehículo (${dto.plate}) y requiere revisión.`,
    }).catch(() => {});
    this.gateway.notifyPlatform('vehicle.registered', { vehicle_id: vehicle.id });
    this.gateway.notifyCoop(cooperative.id, 'vehicle.registered', { vehicle_id: vehicle.id });

    return {
      message: `Vehículo registrado bajo ${cooperative.name}. Sube los documentos para revisión.`,
      vehicle_id: vehicle.id,
    };
  }

  async uploadVehicleDocument(
    userId: string,
    vehicleId: string,
    dto: UploadVehicleDocumentDto,
    file: Express.Multer.File,
  ) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId, owner: { id: driver.id } },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    if (!file) throw new BadRequestException('Archivo requerido');

    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Solo se permiten imágenes (JPEG, PNG) o PDF');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('El archivo no puede superar 10MB');
    }

    const folder = dto.type === VehicleDocumentType.VEHICLE_PHOTO
      ? `vehicles/${vehicle.id}/photo`
      : `vehicles/${vehicle.id}/documents`;

    const key = await this.storage.upload(folder, file.originalname, file.buffer, file.mimetype);

    const doc = await this.vehicleDocsRepo.save(
      this.vehicleDocsRepo.create({
        vehicle,
        type: dto.type,
        file_url: key,
        expires_at: dto.expires_at ? new Date(dto.expires_at) : undefined,
        status: DocumentStatus.PENDING,
      }),
    );

    if (dto.type === VehicleDocumentType.VEHICLE_PHOTO) {
      await this.vehiclesRepo.update(vehicle.id, { photo_url: key });
    }

    return { message: 'Documento subido correctamente', document_id: doc.id };
  }

  async getMyVehicles(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    return this.vehiclesRepo.find({
      where: { owner: { id: driver.id } },
      relations: ['owner', 'cooperative'],
    });
  }

  async getVehicleDocuments(userId: string, vehicleId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId, owner: { id: driver.id } },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    return this.vehicleDocsRepo.find({ where: { vehicle: { id: vehicleId } } });
  }

  async getVehicleDocumentUrl(userId: string, vehicleId: string, documentId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const doc = await this.vehicleDocsRepo.findOne({
      where: { id: documentId, vehicle: { id: vehicleId, owner: { id: driver.id } } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const url = await this.storage.getPresignedUrl(doc.file_url);
    return { url, expires_in: 3600 };
  }

  // ── Admin: lista general de vehículos ───────────────────────────────────────

  async listAll(page = 1, limit = 20, status?: string, search?: string, cooperativeId?: string) {
    const qb = this.vehiclesRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.owner', 'o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('v.cooperative', 'c')
      .orderBy('v.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('v.approval_status = :s', { s: status });
    if (cooperativeId) qb.andWhere('c.id = :coopId', { coopId: cooperativeId });
    if (search) {
      qb.andWhere(
        '(v.plate LIKE :q OR v.brand LIKE :q OR v.model LIKE :q OR u.email LIKE :q)',
        { q: `%${search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();

    // Chofer actualmente al volante: el dueño puede tener varios taxis,
    // manejar uno él mismo y asignarle un chofer a otro (bolsa de empleo)
    // — la lista debe mostrar quién maneja CADA taxi, no solo quién es
    // dueño. VehicleAssignment es el contrato de empleo (a quién le está
    // PERMITIDO manejar), no quién lo está manejando AHORA MISMO — eso
    // vive en Driver.active_vehicle, que start-day/end-day actualiza en
    // tiempo real sin importar si es OWNER_DRIVER o chofer contratado.
    const vehicleIds = items.map((v) => v.id);
    const activeDrivers = vehicleIds.length
      ? await this.driversRepo.find({
          where: { active_vehicle: { id: In(vehicleIds) } },
          relations: ['active_vehicle'],
        })
      : [];
    const driverByVehicleId = new Map(activeDrivers.map((d) => [d.active_vehicle.id, d]));

    const enriched = items.map((v) => ({
      ...v,
      current_driver: driverByVehicleId.get(v.id)
        ? {
            id: driverByVehicleId.get(v.id)!.id,
            full_name: driverByVehicleId.get(v.id)!.full_name,
          }
        : null,
    }));

    return { items: enriched, total, page, limit };
  }

  // ── Cooperative admin endpoints ──────────────────────────────────────────

  async listPendingByCooperative(cooperativeId: string, page = 1, limit = 20) {
    const [items, total] = await this.vehiclesRepo.findAndCount({
      where: { cooperative: { id: cooperativeId }, approval_status: VehicleApprovalStatus.PENDING },
      relations: ['owner', 'owner.user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async getVehicleById(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({
      where: { id },
      relations: ['owner', 'owner.user'],
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');

    const docs = await this.vehicleDocsRepo.find({ where: { vehicle: { id } } });
    return { ...vehicle, documents: docs };
  }

  async suspendVehicle(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    await this.vehiclesRepo.update(id, { status: VehicleStatus.SUSPENDED });
    return { message: 'Vehículo suspendido' };
  }

  async activateVehicle(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (vehicle.approval_status !== VehicleApprovalStatus.APPROVED) {
      throw new BadRequestException('El vehículo debe estar aprobado antes de activarse');
    }
    await this.vehiclesRepo.update(id, { status: VehicleStatus.ACTIVE });
    return { message: 'Vehículo activado' };
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (vehicle.status === VehicleStatus.ACTIVE) {
      throw new BadRequestException('No se puede eliminar un vehículo activo. Suspéndelo primero.');
    }
    await this.vehiclesRepo.delete(id);
    return { message: 'Vehículo eliminado' };
  }

  async deleteMyVehicle(userId: string, vehicleId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId, owner: { id: driver.id } },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');
    if (vehicle.status === VehicleStatus.ACTIVE) {
      throw new BadRequestException('No puedes eliminar un vehículo activo. Contacta a la cooperativa.');
    }
    if (vehicle.approval_status === VehicleApprovalStatus.APPROVED) {
      throw new BadRequestException('No puedes eliminar un vehículo aprobado. Contacta a la cooperativa para darlo de baja.');
    }

    await this.vehiclesRepo.delete(vehicleId);
    return { message: 'Vehículo eliminado' };
  }

  async approveVehicle(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id }, relations: ['owner', 'cooperative'] });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (vehicle.approval_status === VehicleApprovalStatus.APPROVED) {
      throw new BadRequestException('El vehículo ya está aprobado');
    }

    // El conductor debe ser socio aprobado de la cooperativa antes de aprobar el vehículo
    if (vehicle.cooperative?.id && vehicle.owner?.id) {
      const membership = await this.cooperativeOwnersRepo.findOne({
        where: { owner: { id: vehicle.owner.id }, cooperative: { id: vehicle.cooperative.id } },
      });
      if (!membership || membership.approval_status !== OwnerApprovalStatus.APPROVED) {
        throw new ForbiddenException('Debes aprobar al conductor como socio de la cooperativa antes de aprobar su vehículo.');
      }
    }

    await this.vehiclesRepo.update(id, {
      approval_status: VehicleApprovalStatus.APPROVED,
      rejection_reason: null,
    });

    if (vehicle.owner?.id) {
      this.gateway.notifyDriver(vehicle.owner.id, 'vehicle.approved', { vehicle_id: id });
    }
    this.gateway.notifyPlatform('vehicle.approved', { vehicle_id: id });
    if (vehicle.cooperative?.id) {
      this.gateway.notifyCoop(vehicle.cooperative.id, 'vehicle.approved', { vehicle_id: id });
    }

    return { message: 'Vehículo aprobado' };
  }

  async rejectVehicle(id: string, dto: RejectVehicleDto) {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id }, relations: ['cooperative'] });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (vehicle.approval_status === VehicleApprovalStatus.APPROVED) {
      throw new ForbiddenException('No se puede rechazar un vehículo ya aprobado');
    }

    await this.vehiclesRepo.update(id, {
      approval_status: VehicleApprovalStatus.REJECTED,
      rejection_reason: dto.reason,
    });
    this.gateway.notifyPlatform('vehicle.rejected', { vehicle_id: id });
    if (vehicle.cooperative?.id) {
      this.gateway.notifyCoop(vehicle.cooperative.id, 'vehicle.rejected', { vehicle_id: id });
    }

    return { message: 'Vehículo rechazado' };
  }

  async approveVehicleDocument(vehicleId: string, documentId: string) {
    const doc = await this.vehicleDocsRepo.findOne({
      where: { id: documentId, vehicle: { id: vehicleId } },
      relations: ['vehicle', 'vehicle.owner'],
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('El documento ya está aprobado');
    }

    await this.vehicleDocsRepo.update(documentId, {
      status: DocumentStatus.APPROVED,
      rejection_reason: null,
    });

    const ownerId = doc.vehicle?.owner?.id;
    if (ownerId) {
      this.gateway.notifyDriver(ownerId, 'document.approved', { document_id: documentId, vehicle_id: vehicleId });
    }

    return { message: 'Documento aprobado' };
  }

  async rejectVehicleDocument(vehicleId: string, documentId: string, dto: RejectDocumentDto) {
    const doc = await this.vehicleDocsRepo.findOne({
      where: { id: documentId, vehicle: { id: vehicleId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) {
      throw new ForbiddenException('No se puede rechazar un documento ya aprobado');
    }

    await this.vehicleDocsRepo.update(documentId, {
      status: DocumentStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    return { message: 'Documento rechazado. El conductor podrá resubir.' };
  }

  async assignDriver(vehicleId: string, ownerId: string, driverId: string | null) {
    const owner = await this.driversRepo.findOne({ where: { user: { id: ownerId } } });
    if (!owner) throw new NotFoundException('Perfil de conductor no encontrado');

    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId, owner: { id: owner.id } },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    if (driverId === null) {
      await this.vehiclesRepo.update(vehicleId, { assigned_driver: null });
      return { message: 'Conductor desasignado del vehículo' };
    }

    const driver = await this.driversRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    if (driver.driver_type !== DriverType.OWNER_DRIVER && driver.driver_type !== DriverType.DRIVER) {
      throw new BadRequestException('Tipo de conductor inválido');
    }
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new BadRequestException('El conductor debe estar aprobado por la plataforma');
    }

    // Ensure driver is not already assigned to another vehicle
    const alreadyAssigned = await this.vehiclesRepo.findOne({
      where: { assigned_driver: { id: driverId } },
    });
    if (alreadyAssigned && alreadyAssigned.id !== vehicleId) {
      throw new ConflictException('Este conductor ya está asignado a otro vehículo');
    }

    await this.vehiclesRepo.update(vehicleId, { assigned_driver: driver });
    return { message: `Conductor asignado al vehículo ${vehicle.plate}` };
  }

  async getAdminDocumentUrl(vehicleId: string, documentId: string) {
    const doc = await this.vehicleDocsRepo.findOne({
      where: { id: documentId, vehicle: { id: vehicleId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const url = await this.storage.getPresignedUrl(doc.file_url);
    return { url, expires_in: 3600 };
  }

  private async notifyCoopAdmins(cooperativeId: string, payload: { title: string; body: string }): Promise<void> {
    const members = await this.coopMembersRepo.find({
      where: { cooperative: { id: cooperativeId } },
      relations: ['user'],
      select: { user: { id: true } },
    });
    const ids = members.map(m => m.user?.id).filter(Boolean) as string[];
    if (!ids.length) return;
    await this.notifications.sendToUsers(ids, { ...payload, data: {} });
  }
}
