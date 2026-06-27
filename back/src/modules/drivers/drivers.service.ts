import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Driver, DriverApprovalStatus, DriverType, DriverOnlineStatus } from './entities/driver.entity';
import { DriverDocument, DriverDocumentType, DocumentStatus } from './entities/driver-document.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { Cooperative, CooperativeStatus, CooperativeApprovalStatus } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { StorageService } from '../storage/storage.service';
import { TermsService } from '../terms/terms.service';
import { TermsType } from '../terms/entities/terms-version.entity';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { UploadDriverDocumentDto } from './dto/upload-driver-document.dto';
import { RejectDriverDto } from './dto/reject-driver.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { JoinCooperativeDto } from './dto/join-cooperative.dto';
import { FareService } from '../fare/fare.service';

@Injectable()
export class DriversService {
  // Caché del conductor + vehículo activo por jornada.
  // Se llena en startDay, se borra en endDay. TTL de seguridad: 4 horas.
  // Evita ir a la BD cada vez que un viaje necesita saber qué taxi usa el conductor.
  private readonly driverVehicleCache = new Map<string, { driver: Driver; expiresAt: number }>();
  private static readonly VEHICLE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private documentsRepo: Repository<DriverDocument>,
    @InjectRepository(DriverWallet)
    private walletRepo: Repository<DriverWallet>,
    @InjectRepository(Cooperative)
    private cooperativesRepo: Repository<Cooperative>,
    @InjectRepository(CooperativeOwner)
    private cooperativeOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleAssignment)
    private assignmentsRepo: Repository<VehicleAssignment>,
    private storage: StorageService,
    private termsService: TermsService,
    private fareService: FareService,
  ) {}

  // Retorna conductor con active_vehicle+cooperative desde caché o BD.
  // Usar en lugar de driversRepo.findOne con esas relaciones.
  async getCachedDriverWithVehicle(driverId: string): Promise<Driver | null> {
    const cached = this.driverVehicleCache.get(driverId);
    if (cached && Date.now() < cached.expiresAt) return cached.driver;

    const driver = await this.driversRepo.findOne({
      where: { id: driverId },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (driver?.active_vehicle) {
      this.driverVehicleCache.set(driverId, {
        driver,
        expiresAt: Date.now() + DriversService.VEHICLE_CACHE_TTL_MS,
      });
    }
    return driver ?? null;
  }

  private setCachedDriver(driver: Driver): void {
    this.driverVehicleCache.set(driver.id, {
      driver,
      expiresAt: Date.now() + DriversService.VEHICLE_CACHE_TTL_MS,
    });
  }

  // ── Registro ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDriverDto) {
    const exists = await this.usersRepo.findOne({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Teléfono ya registrado');

    const terms = await this.termsService.validateAcceptance(TermsType.DRIVER, dto.terms_version);

    const user = await this.usersRepo.save(
      this.usersRepo.create({
        phone: dto.phone,
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
        terms_version: terms.version,
        terms_accepted_at: new Date(),
      }),
    );

    const driver = await this.driversRepo.save(
      this.driversRepo.create({
        user,
        full_name: dto.full_name,
        driver_type: dto.driver_type,
        license_number: dto.license_number,
        license_expiry: dto.license_expiry ? new Date(dto.license_expiry) : undefined,
      }),
    );

    await this.walletRepo.save(this.walletRepo.create({ driver }));

    const next = dto.driver_type === DriverType.OWNER_DRIVER
      ? 'Sube tus documentos y luego solicita unirte a tu cooperativa.'
      : 'Sube tus documentos para que la plataforma los revise.';

    return {
      message: `Registro exitoso. Verifica tu teléfono con POST /auth/otp/request. ${next}`,
      driver_id: driver.id,
    };
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'active_vehicle'],
    });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const cooperatives = await this.cooperativeOwnersRepo.find({
      where: { owner: { id: driver.id } },
      relations: ['cooperative'],
    });

    const { otp_code, otp_expires_at, refresh_token, password_hash, ...user } = driver.user as any;
    return { ...driver, user, cooperatives };
  }

  async setOnlineStatus(userId: string, status: DriverOnlineStatus) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para cambiar disponibilidad');
    }
    if (status === DriverOnlineStatus.LOOKING_FOR_WORK && driver.driver_type !== DriverType.DRIVER) {
      throw new ForbiddenException('Solo conductores regulares pueden activar "buscando trabajo"');
    }
    if (status === DriverOnlineStatus.ONLINE && !driver.active_vehicle) {
      throw new ForbiddenException('Debes iniciar jornada con un vehículo activo antes de ponerte en línea. Usa POST /drivers/me/start-day');
    }

    await this.driversRepo.update(driver.id, { online_status: status, last_seen_at: new Date() });
    return { online_status: status };
  }

  // ── Iniciar / finalizar jornada ──────────────────────────────────────────────

  async startDay(userId: string, vehicleId?: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['active_vehicle'],
    });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para iniciar jornada');
    }

    let vehicle: Vehicle;

    if (driver.driver_type === DriverType.OWNER_DRIVER) {
      // OWNER_DRIVER: debe especificar cuál de sus vehículos maneja hoy
      if (!vehicleId) throw new BadRequestException('Debes indicar el vehicle_id del taxi que manejarás hoy');
      vehicle = await this.vehiclesRepo.findOne({
        where: { id: vehicleId, owner: { id: driver.id }, approval_status: VehicleApprovalStatus.APPROVED },
      });
      if (!vehicle) throw new NotFoundException('Vehículo no encontrado, no te pertenece o no está aprobado');

    } else {
      // DRIVER (chofer): usa el vehículo de su jornada activa (VehicleAssignment)
      const assignment = await this.assignmentsRepo.findOne({
        where: { driver: { id: driver.id }, status: AssignmentStatus.ACTIVE },
        relations: ['vehicle'],
      });
      if (!assignment) {
        throw new ForbiddenException('No tienes una jornada asignada. El dueño del taxi debe publicar una solicitud y debes aceptarla primero.');
      }
      vehicle = assignment.vehicle;
      if (vehicleId && vehicle.id !== vehicleId) {
        throw new BadRequestException('El vehicle_id no coincide con tu jornada activa');
      }
    }

    await this.driversRepo.update(driver.id, {
      active_vehicle: vehicle,
      online_status: DriverOnlineStatus.ONLINE,
      last_seen_at: new Date(),
    });

    // Cargar driver completo con vehículo+cooperativa para el caché
    const updatedDriver = await this.driversRepo.findOne({
      where: { id: driver.id },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (updatedDriver) this.setCachedDriver(updatedDriver);

    const fareConfig = await this.fareService.getConfig();

    return {
      message: 'Jornada iniciada. Ya puedes recibir viajes.',
      vehicle_plate: vehicle.plate,
      online_status: DriverOnlineStatus.ONLINE,
      location_update_interval_sec: fareConfig.location_interval_fleet_sec,
    };
  }

  async endDay(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    await this.driversRepo.update(driver.id, {
      active_vehicle: null,
      online_status: DriverOnlineStatus.OFFLINE,
      last_seen_at: new Date(),
    });

    // Limpiar caché al terminar jornada
    this.driverVehicleCache.delete(driver.id);

    return { message: 'Jornada finalizada. Hasta pronto.' };
  }

  // ── Documentos ──────────────────────────────────────────────────────────────

  async uploadDocument(userId: string, dto: UploadDriverDocumentDto, file: Express.Multer.File) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    if (!file) throw new BadRequestException('Archivo requerido');
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) throw new BadRequestException('Solo JPEG, PNG o PDF');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Máximo 10MB');

    const folder = dto.type === DriverDocumentType.PROFILE_PHOTO
      ? `drivers/${driver.id}/photo`
      : `drivers/${driver.id}/documents`;

    const key = await this.storage.upload(folder, file.originalname, file.buffer, file.mimetype);

    const doc = await this.documentsRepo.save(
      this.documentsRepo.create({
        driver,
        type: dto.type,
        file_url: key,
        expires_at: dto.expires_at ? new Date(dto.expires_at) : undefined,
        status: DocumentStatus.PENDING,
      }),
    );

    if (dto.type === DriverDocumentType.PROFILE_PHOTO) {
      await this.driversRepo.update(driver.id, { profile_photo_url: key });
    }

    return { message: 'Documento subido correctamente', document_id: doc.id };
  }

  async getMyDocuments(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    return this.documentsRepo.find({ where: { driver: { id: driver.id } }, order: { created_at: 'DESC' } });
  }

  async getDocumentUrl(userId: string, documentId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driver.id } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    return { url: await this.storage.getPresignedUrl(doc.file_url), expires_in: 3600 };
  }

  // ── Unirse a cooperativa (OWNER_DRIVER) ─────────────────────────────────────

  async joinCooperative(userId: string, dto: JoinCooperativeDto) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.driver_type !== DriverType.OWNER_DRIVER) {
      throw new ForbiddenException('Solo los conductores-dueños pueden unirse a cooperativas');
    }
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('La plataforma debe aprobar tus documentos antes de unirte a una cooperativa');
    }

    const cooperative = await this.cooperativesRepo.findOne({ where: { id: dto.cooperative_id } });
    if (!cooperative) throw new NotFoundException('Cooperativa no encontrada');
    if (cooperative.approval_status !== CooperativeApprovalStatus.APPROVED) {
      throw new BadRequestException('La cooperativa no ha sido aprobada por la plataforma');
    }
    if (cooperative.status !== CooperativeStatus.ACTIVE) {
      throw new BadRequestException('La cooperativa está suspendida');
    }

    const alreadyMember = await this.cooperativeOwnersRepo.findOne({
      where: { owner: { id: driver.id }, cooperative: { id: dto.cooperative_id } },
    });
    if (alreadyMember) throw new ConflictException('Ya eres miembro de esta cooperativa');

    await this.cooperativeOwnersRepo.save(
      this.cooperativeOwnersRepo.create({ owner: driver, cooperative }),
    );

    return { message: `Solicitud enviada a ${cooperative.name}. Espera su aprobación.` };
  }

  async getMyCooperatives(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    return this.cooperativeOwnersRepo.find({
      where: { owner: { id: driver.id } },
      relations: ['cooperative'],
      order: { created_at: 'DESC' },
    });
  }

  // ── Admin: lista general de conductores ─────────────────────────────────────

  async listAll(page = 1, limit = 20, approvalStatus?: string, search?: string) {
    const qb = this.driversRepo.createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u')
      .orderBy('d.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (approvalStatus) qb.andWhere('d.approval_status = :s', { s: approvalStatus });
    if (search) {
      qb.andWhere('(u.email LIKE :q OR u.phone LIKE :q OR d.full_name LIKE :q)', { q: `%${search}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  // ── Plataforma: aprueba conductores tipo DRIVER ──────────────────────────────

  async listPlatformPending(page = 1, limit = 20) {
    const [items, total] = await this.driversRepo.findAndCount({
      where: { approval_status: DriverApprovalStatus.PENDING },
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async platformApprove(id: string) {
    const driver = await this.driversRepo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    if (driver.approval_status === DriverApprovalStatus.APPROVED) {
      throw new BadRequestException('El conductor ya está aprobado');
    }

    await this.driversRepo.update(id, { approval_status: DriverApprovalStatus.APPROVED, rejection_reason: null });

    const msg = driver.driver_type === DriverType.OWNER_DRIVER
      ? 'Conductor-dueño aprobado. Ahora puede solicitar unirse a cooperativas.'
      : 'Conductor aprobado. Ya puede recibir viajes.';
    return { message: msg };
  }

  async platformReject(id: string, dto: RejectDriverDto) {
    const driver = await this.driversRepo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    if (driver.approval_status === DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('No se puede rechazar un conductor ya aprobado');
    }

    await this.driversRepo.update(id, { approval_status: DriverApprovalStatus.REJECTED, rejection_reason: dto.reason });
    return { message: 'Conductor rechazado' };
  }

  // ── Cooperativa: aprueba membresía de OWNER_DRIVER ───────────────────────────

  async listCooperativePending(cooperativeId: string, page = 1, limit = 20) {
    const [items, total] = await this.cooperativeOwnersRepo.findAndCount({
      where: { cooperative: { id: cooperativeId }, approval_status: OwnerApprovalStatus.PENDING },
      relations: ['owner', 'owner.user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async cooperativeApprove(driverId: string, cooperativeId: string) {
    const membership = await this.cooperativeOwnersRepo.findOne({
      where: { owner: { id: driverId }, cooperative: { id: cooperativeId } },
      relations: ['owner'],
    });
    if (!membership) throw new NotFoundException('El conductor no pertenece a esta cooperativa');
    if (membership.approval_status === OwnerApprovalStatus.APPROVED) {
      throw new BadRequestException('El conductor ya está aprobado en esta cooperativa');
    }

    await this.cooperativeOwnersRepo.update(membership.id, {
      approval_status: OwnerApprovalStatus.APPROVED,
      rejection_reason: null,
    });

    return { message: 'Conductor-dueño aprobado en la cooperativa' };
  }

  async cooperativeReject(driverId: string, cooperativeId: string, dto: RejectDriverDto) {
    const membership = await this.cooperativeOwnersRepo.findOne({
      where: { owner: { id: driverId }, cooperative: { id: cooperativeId } },
    });
    if (!membership) throw new NotFoundException('El conductor no pertenece a esta cooperativa');
    if (membership.approval_status === OwnerApprovalStatus.APPROVED) {
      throw new ForbiddenException('No se puede rechazar una membresía ya aprobada');
    }

    await this.cooperativeOwnersRepo.update(membership.id, {
      approval_status: OwnerApprovalStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    return { message: 'Solicitud de membresía rechazada' };
  }

  // ── Aprobación de documentos (compartido) ────────────────────────────────────

  async getDriverById(id: string) {
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    const docs = await this.documentsRepo.find({ where: { driver: { id } }, order: { created_at: 'DESC' } });
    const cooperatives = await this.cooperativeOwnersRepo.find({
      where: { owner: { id } },
      relations: ['cooperative'],
    });
    return { ...driver, documents: docs, cooperatives };
  }

  async approveDocument(driverId: string, documentId: string) {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driverId } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) throw new BadRequestException('El documento ya está aprobado');

    await this.documentsRepo.update(documentId, { status: DocumentStatus.APPROVED, rejection_reason: null });
    return { message: 'Documento aprobado' };
  }

  async rejectDocument(driverId: string, documentId: string, dto: RejectDocumentDto) {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driverId } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) throw new ForbiddenException('No se puede rechazar un documento ya aprobado');

    await this.documentsRepo.update(documentId, { status: DocumentStatus.REJECTED, rejection_reason: dto.reason });
    return { message: 'Documento rechazado. El conductor podrá resubir.' };
  }

  async getAdminDocumentUrl(driverId: string, documentId: string) {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driverId } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    return { url: await this.storage.getPresignedUrl(doc.file_url), expires_in: 3600 };
  }

  async blockDriver(driverId: string) {
    const driver = await this.driversRepo.findOne({ where: { id: driverId }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    await this.usersRepo.update(driver.user.id, { status: UserStatus.SUSPENDED });
    return { message: 'Conductor bloqueado' };
  }

  async unblockDriver(driverId: string) {
    const driver = await this.driversRepo.findOne({ where: { id: driverId }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    await this.usersRepo.update(driver.user.id, { status: UserStatus.ACTIVE });
    return { message: 'Conductor desbloqueado' };
  }
}
