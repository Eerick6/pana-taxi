import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Driver, DriverApprovalStatus, DriverType, DriverOnlineStatus } from './entities/driver.entity';
import { DriverDocument, DriverDocumentType, DocumentStatus, REQUIRED_DOCS } from './entities/driver-document.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { Cooperative, CooperativeStatus, CooperativeApprovalStatus } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleDocument } from '../vehicles/entities/vehicle-document.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { StorageService } from '../storage/storage.service';
import { TermsService } from '../terms/terms.service';
import { EventsGateway } from '../gateway/events.gateway';
import { TermsType } from '../terms/entities/terms-version.entity';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { UploadDriverDocumentDto } from './dto/upload-driver-document.dto';
import { RejectDriverDto } from './dto/reject-driver.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { JoinCooperativeDto } from './dto/join-cooperative.dto';
import { FareService } from '../fare/fare.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  // Redis cache TTL for driver+vehicle: 4 hours
  private static readonly VEHICLE_CACHE_TTL_S = 4 * 60 * 60;

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
    @InjectRepository(CooperativeMember)
    private coopMembersRepo: Repository<CooperativeMember>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleDocument)
    private vehicleDocsRepo: Repository<VehicleDocument>,
    @InjectRepository(VehicleAssignment)
    private assignmentsRepo: Repository<VehicleAssignment>,
    private storage: StorageService,
    private termsService: TermsService,
    private fareService: FareService,
    private gateway: EventsGateway,
    private notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  // Retorna conductor con active_vehicle+cooperative desde Redis o BD.
  // Usar en lugar de driversRepo.findOne con esas relaciones.
  async getCachedDriverWithVehicle(driverId: string): Promise<Driver | null> {
    const cacheKey = `driver:cache:${driverId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Driver;
    } catch (err) {
      this.logger.warn(`Redis cache get failed for driver ${driverId}: ${err.message}`);
    }

    const driver = await this.driversRepo.findOne({
      where: { id: driverId },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (driver?.active_vehicle) {
      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(driver),
          'EX',
          DriversService.VEHICLE_CACHE_TTL_S,
        );
      } catch (err) {
        this.logger.warn(`Redis cache set failed for driver ${driverId}: ${err.message}`);
      }
    }
    return driver ?? null;
  }

  private async setCachedDriver(driver: Driver): Promise<void> {
    const cacheKey = `driver:cache:${driver.id}`;
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(driver),
        'EX',
        DriversService.VEHICLE_CACHE_TTL_S,
      );
    } catch (err) {
      this.logger.warn(`Redis cache set failed for driver ${driver.id}: ${err.message}`);
    }
  }

  // Invalida la caché de Redis del conductor (llamar cuando cambia vehículo o aprobación)
  async invalidateDriverCache(driverId: string): Promise<void> {
    try {
      await this.redis.del(`driver:cache:${driverId}`);
    } catch (err) {
      this.logger.warn(`Redis cache invalidation failed for driver ${driverId}: ${err.message}`);
    }
  }

  // Lee la última ubicación conocida del conductor desde Redis.
  // Usar en getAvailableTrips en lugar de driver.current_lat desde BD.
  async getDriverLocationFromRedis(
    driverId: string,
  ): Promise<{ lat: number; lng: number; updated_at: number } | null> {
    try {
      const raw = await this.redis.get(`driver:location:${driverId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      this.logger.warn(`Redis location get failed for driver ${driverId}: ${err.message}`);
      return null;
    }
  }

  // ── Registro ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDriverDto) {
    const exists = await this.usersRepo.findOne({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Teléfono ya registrado');

    const terms = await this.termsService.validateAcceptance(TermsType.DRIVER, dto.terms_version);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        phone: dto.phone,
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
        terms_version: terms.version,
        terms_accepted_at: new Date(),
        password_hash: passwordHash,
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

  private async signPhotoUrl(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    return this.storage.getPresignedUrl(key, 7200);
  }

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
    const profile_photo_url = await this.signPhotoUrl(driver.profile_photo_url);
    return { ...driver, profile_photo_url, user, cooperatives };
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.online_status === DriverOnlineStatus.OFFLINE) {
      throw new ForbiddenException('Debes estar en línea para actualizar ubicación');
    }
    await this.driversRepo.update(driver.id, {
      current_lat: lat,
      current_lng: lng,
      last_seen_at: new Date(),
    });
    return { message: 'Ubicación actualizada', lat, lng };
  }

  async requestReview(userId: string) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['documents'],
    });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    if (driver.approval_status === DriverApprovalStatus.APPROVED) {
      return { message: 'Tu perfil ya está aprobado.' };
    }
    await this.driversRepo.update(driver.id, { review_requested_at: new Date() });
    this.notifyPlatformAdmins(driver.id, 'review_request').catch(() => {});
    return { message: 'Solicitud enviada. El equipo revisará tu perfil en 24–48 horas.' };
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
    await this.gateway.syncAvailableRoom(userId, status !== DriverOnlineStatus.OFFLINE);
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

      // Verificar que nadie más tenga ese taxi en jornada activa
      const taxiEnUso = await this.driversRepo.findOne({
        where: { active_vehicle: { id: vehicle.id }, online_status: Not(DriverOnlineStatus.OFFLINE) },
      });
      if (taxiEnUso && taxiEnUso.id !== driver.id) {
        throw new ConflictException('Este taxi ya tiene una jornada activa iniciada por otro conductor.');
      }

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

      // Verificar que el dueño u otro conductor no lo tenga en jornada activa
      const taxiEnUso = await this.driversRepo.findOne({
        where: { active_vehicle: { id: vehicle.id }, online_status: Not(DriverOnlineStatus.OFFLINE) },
      });
      if (taxiEnUso && taxiEnUso.id !== driver.id) {
        throw new ConflictException('Este taxi ya tiene una jornada activa. Espera a que el conductor actual finalice su jornada.');
      }
    }

    await this.driversRepo.update(driver.id, {
      active_vehicle: vehicle,
      online_status: DriverOnlineStatus.ONLINE,
      last_seen_at: new Date(),
    });

    await this.gateway.syncAvailableRoom(userId, true);

    // Cargar driver completo con vehículo+cooperativa para el caché
    const updatedDriver = await this.driversRepo.findOne({
      where: { id: driver.id },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (updatedDriver) await this.setCachedDriver(updatedDriver);

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

    await this.gateway.syncAvailableRoom(userId, false);

    // Limpiar caché Redis al terminar jornada
    await this.invalidateDriverCache(driver.id);

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

    // Si ya existe un documento del mismo tipo, reemplazarlo (evita acumulación de fotos)
    const existing = await this.documentsRepo.findOne({
      where: { driver: { id: driver.id }, type: dto.type as any },
    });
    if (existing) await this.documentsRepo.delete(existing.id);

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

    // Notificar al admin cuando se suban todos los documentos obligatorios por primera vez
    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      const uploaded = await this.documentsRepo.find({ where: { driver: { id: driver.id } } });
      const uploadedTypes = new Set(uploaded.map(d => d.type));
      const allRequired = REQUIRED_DOCS.every(t => uploadedTypes.has(t));
      if (allRequired) {
        await this.driversRepo.update(driver.id, { review_requested_at: new Date() });
        this.notifyPlatformAdmins(driver.id, 'review_request').catch(() => {});
      }
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

    this.notifyCoopAdmins(dto.cooperative_id, {
      title: 'Nueva solicitud de membresía',
      body: `${driver.full_name} solicita unirse a ${cooperative.name} como socio.`,
    }).catch(() => {});

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

  async listAll(page = 1, limit = 20, approvalStatus?: string, search?: string, cooperativeId?: string) {
    const qb = this.driversRepo.createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u')
      .leftJoinAndSelect('d.active_vehicle', 'v')
      .leftJoinAndSelect('v.cooperative', 'coop')
      .orderBy('d.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (approvalStatus) qb.andWhere('d.approval_status = :s', { s: approvalStatus });
    if (search) {
      qb.andWhere('(u.email LIKE :q OR u.phone LIKE :q OR d.full_name LIKE :q)', { q: `%${search}%` });
    }
    if (cooperativeId) {
      qb.andWhere('v.cooperative_id = :cid', { cid: cooperativeId });
    }

    const [items, total] = await qb.getManyAndCount();
    const signedItems = await Promise.all(
      items.map(async (d) => ({ ...d, profile_photo_url: await this.signPhotoUrl(d.profile_photo_url) })),
    );
    return { items: signedItems, total, page, limit };
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
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    if (driver.approval_status === DriverApprovalStatus.APPROVED) {
      throw new BadRequestException('El conductor ya está aprobado');
    }

    await this.driversRepo.update(id, { approval_status: DriverApprovalStatus.APPROVED, rejection_reason: null });

    // Notificar al conductor en tiempo real para que la app actualice sin recargar
    this.gateway.notifyDriver(id, 'driver.approved', { driver_id: id });

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

  async listCooperativeMembers(cooperativeId: string, page = 1, limit = 20, search?: string) {
    const qb = this.cooperativeOwnersRepo.createQueryBuilder('co')
      .leftJoinAndSelect('co.owner', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .where('co.cooperative_id = :cid', { cid: cooperativeId })
      .orderBy('co.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(d.full_name LIKE :q OR u.email LIKE :q OR u.phone LIKE :q)', { q: `%${search}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

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
    const profile_photo_url = await this.signPhotoUrl(driver.profile_photo_url);
    return { ...driver, profile_photo_url, documents: docs, cooperatives };
  }

  async approveDocument(driverId: string, documentId: string) {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driverId } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) throw new BadRequestException('El documento ya está aprobado');

    await this.documentsRepo.update(documentId, { status: DocumentStatus.APPROVED, rejection_reason: null });
    this.gateway.notifyDriver(driverId, 'document.approved', { document_id: documentId });
    return { message: 'Documento aprobado' };
  }

  async rejectDocument(driverId: string, documentId: string, dto: RejectDocumentDto) {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId, driver: { id: driverId } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === DocumentStatus.APPROVED) throw new ForbiddenException('No se puede rechazar un documento ya aprobado');

    await this.documentsRepo.update(documentId, { status: DocumentStatus.REJECTED, rejection_reason: dto.reason });
    this.gateway.notifyDriver(driverId, 'document.rejected', { document_id: documentId, reason: dto.reason });
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

  async deleteDriver(id: string) {
    const driver = await this.driversRepo.findOne({ where: { id }, relations: ['user'] });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    if (driver.online_status !== DriverOnlineStatus.OFFLINE) {
      throw new BadRequestException('El conductor debe estar desconectado para poder eliminarlo');
    }
    const userId = driver.user.id;

    // Única condición bloqueante: saldo en billetera
    const wallet = await this.walletRepo.findOne({ where: { driver: { id } } });
    if (wallet && parseFloat(wallet.balance) > 0) {
      throw new BadRequestException(
        `El conductor tiene un saldo pendiente de $${parseFloat(wallet.balance).toFixed(2)}. Liquida el saldo antes de eliminar.`,
      );
    }

    // Borrado en cascada — orden por FKs
    if (wallet) await this.walletRepo.delete(wallet.id);
    await this.documentsRepo.delete({ driver: { id } });

    const vehicles = await this.vehiclesRepo.find({ where: { owner: { id } }, select: ['id'] });
    if (vehicles.length > 0) {
      const vehicleIds = vehicles.map(v => v.id);
      await this.vehicleDocsRepo.delete({ vehicle: { id: In(vehicleIds) } });
      await this.assignmentsRepo.delete({ vehicle: { id: In(vehicleIds) } });
      await this.vehiclesRepo.delete({ owner: { id } });
    }

    await this.cooperativeOwnersRepo.delete({ owner: { id } });
    await this.driversRepo.remove(driver);
    await this.usersRepo.delete(userId);
    return { message: 'Conductor eliminado' };
  }

  async findNearby(lat: number, lng: number, radiusKm: number) {
    const drivers = await this.driversRepo
      .createQueryBuilder('d')
      .select(['d.id', 'd.current_lat', 'd.current_lng'])
      .where('d.online_status = :online', { online: DriverOnlineStatus.ONLINE })
      .andWhere('d.current_lat IS NOT NULL')
      .andWhere('d.current_lng IS NOT NULL')
      .andWhere(
        `(6371 * acos(LEAST(1, cos(radians(:lat)) * cos(radians(d.current_lat)) * cos(radians(d.current_lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(d.current_lat))))) <= :radius`,
        { lat, lng, radius: radiusKm },
      )
      .getMany();

    // ±~50m de ruido para evitar stalking de conductores por clientes
    const fuzz = (v: number) => v + (Math.random() - 0.5) * 0.0009;
    return drivers.map(d => ({
      id: d.id,
      lat: fuzz(parseFloat(d.current_lat as any)),
      lng: fuzz(parseFloat(d.current_lng as any)),
    }));
  }

  async notifyCoopAdmins(cooperativeId: string, payload: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    const members = await this.coopMembersRepo.find({
      where: { cooperative: { id: cooperativeId } },
      relations: ['user'],
      select: { user: { id: true } },
    });
    const ids = members.map(m => m.user.id).filter(Boolean);
    if (!ids.length) return;
    await this.notifications.sendToUsers(ids, { ...payload, data: payload.data ?? {} });
  }

  private async notifyPlatformAdmins(driverId: string, reason: string): Promise<void> {
    const admins = await this.usersRepo.find({
      where: [{ role: UserRole.OWNER }, { role: UserRole.PLATFORM_ADMIN }],
      select: ['id'],
    });
    const ids = admins.map(u => u.id);
    if (!ids.length) return;
    const isReview = reason === 'review_request';
    await this.notifications.sendToUsers(ids, {
      title: isReview ? '📋 Solicitud de revisión de perfil' : 'Documento subido por conductor',
      body: isReview
        ? 'Un conductor solicita revisión de su perfil. Revisa los documentos en el panel.'
        : `Un conductor subió un nuevo documento (${reason}). Revisa y aprueba en el panel.`,
      data: { type: 'driver_document', driver_id: driverId },
    });
  }
}
