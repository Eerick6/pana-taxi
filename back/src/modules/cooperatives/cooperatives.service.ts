import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cooperative, CooperativeStatus, CooperativeApprovalStatus } from './entities/cooperative.entity';
import { CooperativeMember, CooperativeMemberRole } from './entities/cooperative-member.entity';
import { CooperativeDocument, CooperativeDocumentStatus } from './entities/cooperative-document.entity';
import { CooperativeOwner, OwnerApprovalStatus } from './entities/cooperative-owner.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Driver, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { In } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { TermsService } from '../terms/terms.service';
import { TermsType } from '../terms/entities/terms-version.entity';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UploadCooperativeDocumentDto } from './dto/upload-cooperative-document.dto';
import { RejectCooperativeDto } from './dto/reject-cooperative.dto';
import { RejectCooperativeDocumentDto } from './dto/reject-cooperative-document.dto';

const ROLE_MAP: Record<CooperativeMemberRole, UserRole> = {
  [CooperativeMemberRole.ADMIN]: UserRole.COOPERATIVE_ADMIN,
  [CooperativeMemberRole.OPERATOR]: UserRole.COOPERATIVE_OPERATOR,
  [CooperativeMemberRole.SUPERVISOR]: UserRole.COOPERATIVE_SUPERVISOR,
};

@Injectable()
export class CooperativesService {
  constructor(
    @InjectRepository(Cooperative)
    private coopRepo: Repository<Cooperative>,
    @InjectRepository(CooperativeMember)
    private membersRepo: Repository<CooperativeMember>,
    @InjectRepository(CooperativeDocument)
    private documentsRepo: Repository<CooperativeDocument>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(CooperativeOwner)
    private coopOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    private storage: StorageService,
    private termsService: TermsService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateCooperativeDto) {
    const nameExists = await this.coopRepo.findOne({ where: { name: dto.name } });
    if (nameExists) throw new ConflictException('Ya existe una cooperativa con ese nombre');

    const rucExists = await this.coopRepo.findOne({ where: { ruc: dto.ruc } });
    if (rucExists) throw new ConflictException('Ya existe una cooperativa con ese RUC');

    const terms = await this.termsService.validateAcceptance(TermsType.COOPERATIVE, dto.terms_version);

    const { terms_version: _tv, ...coopData } = dto;
    const coop = await this.coopRepo.save(
      this.coopRepo.create({
        ...coopData,
        status: CooperativeStatus.INACTIVE,
        approval_status: CooperativeApprovalStatus.PENDING,
        terms_version: terms.version,
        terms_accepted_at: new Date(),
      }),
    );

    return {
      message: 'Cooperativa registrada. Sube los documentos requeridos para que la plataforma pueda aprobarla.',
      cooperative_id: coop.id,
      cooperative: coop,
    };
  }

  async findAll(page = 1, limit = 20) {
    const [items, total] = await this.coopRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    const member_count = await this.membersRepo.count({ where: { cooperative: { id } } });
    return { ...coop, member_count };
  }

  async update(id: string, dto: UpdateCooperativeDto) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    if (dto.name && dto.name !== coop.name) {
      const exists = await this.coopRepo.findOne({ where: { name: dto.name } });
      if (exists) throw new ConflictException('Ya existe una cooperativa con ese nombre');
    }

    if (dto.ruc && dto.ruc !== coop.ruc) {
      const exists = await this.coopRepo.findOne({ where: { ruc: dto.ruc } });
      if (exists) throw new ConflictException('Ya existe una cooperativa con ese RUC');
    }

    await this.coopRepo.update(id, dto);
    return { message: 'Cooperativa actualizada' };
  }

  async suspend(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status !== CooperativeApprovalStatus.APPROVED) {
      throw new BadRequestException('Solo se pueden suspender cooperativas aprobadas');
    }
    if (coop.status === CooperativeStatus.SUSPENDED) {
      throw new BadRequestException('La cooperativa ya está suspendida');
    }

    await this.coopRepo.update(id, { status: CooperativeStatus.SUSPENDED });
    return { message: 'Cooperativa suspendida. Sus owners e integrantes no podrán operar.' };
  }

  async activate(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status !== CooperativeApprovalStatus.APPROVED) {
      throw new BadRequestException('Solo se pueden activar cooperativas aprobadas');
    }
    if (coop.status === CooperativeStatus.ACTIVE) {
      throw new BadRequestException('La cooperativa ya está activa');
    }

    await this.coopRepo.update(id, { status: CooperativeStatus.ACTIVE });
    return { message: 'Cooperativa activada' };
  }

  // ─── DOCUMENTOS ──────────────────────────────────────────────────────────────

  async uploadDocument(
    cooperativeId: string,
    dto: UploadCooperativeDocumentDto,
    file: Express.Multer.File,
  ) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status === CooperativeApprovalStatus.APPROVED) {
      throw new BadRequestException('La cooperativa ya está aprobada');
    }

    const key = await this.storage.upload(
      `cooperatives/${cooperativeId}/docs`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    await this.documentsRepo.save(
      this.documentsRepo.create({
        cooperative: coop,
        type: dto.type,
        file_url: key,
        status: CooperativeDocumentStatus.PENDING,
      }),
    );

    return { message: 'Documento subido. La plataforma lo revisará.' };
  }

  async getDocuments(cooperativeId: string) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    return this.documentsRepo.find({
      where: { cooperative: { id: cooperativeId } },
      order: { created_at: 'DESC' },
    });
  }

  async getDocumentUrl(cooperativeId: string, docId: string) {
    const doc = await this.documentsRepo.findOne({
      where: { id: docId, cooperative: { id: cooperativeId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const url = await this.storage.getPresignedUrl(doc.file_url);
    return { url };
  }

  // ─── APROBACIÓN DE COOPERATIVA ───────────────────────────────────────────────

  async listPending(page = 1, limit = 20) {
    const [items, total] = await this.coopRepo.findAndCount({
      where: { approval_status: CooperativeApprovalStatus.PENDING },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async approveCooperative(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status !== CooperativeApprovalStatus.PENDING) {
      throw new BadRequestException('La cooperativa no está pendiente de aprobación');
    }

    await this.coopRepo.update(id, {
      approval_status: CooperativeApprovalStatus.APPROVED,
      status: CooperativeStatus.ACTIVE,
      rejection_reason: null,
    });

    return { message: 'Cooperativa aprobada y activada. Ya puede registrar owners.' };
  }

  async rejectCooperative(id: string, dto: RejectCooperativeDto) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status !== CooperativeApprovalStatus.PENDING) {
      throw new BadRequestException('La cooperativa no está pendiente de aprobación');
    }

    await this.coopRepo.update(id, {
      approval_status: CooperativeApprovalStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    return { message: 'Cooperativa rechazada' };
  }

  // ─── APROBACIÓN DE DOCUMENTOS ────────────────────────────────────────────────

  async approveDocument(cooperativeId: string, docId: string) {
    const doc = await this.documentsRepo.findOne({
      where: { id: docId, cooperative: { id: cooperativeId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === CooperativeDocumentStatus.APPROVED) {
      throw new BadRequestException('El documento ya está aprobado');
    }

    await this.documentsRepo.update(docId, {
      status: CooperativeDocumentStatus.APPROVED,
      rejection_reason: null,
    });

    return { message: 'Documento aprobado' };
  }

  async rejectDocument(cooperativeId: string, docId: string, dto: RejectCooperativeDocumentDto) {
    const doc = await this.documentsRepo.findOne({
      where: { id: docId, cooperative: { id: cooperativeId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === CooperativeDocumentStatus.APPROVED) {
      throw new BadRequestException('No se puede rechazar un documento ya aprobado');
    }

    await this.documentsRepo.update(docId, {
      status: CooperativeDocumentStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    return { message: 'Documento rechazado. La cooperativa puede subir uno nuevo.' };
  }

  // ─── MIEMBROS ────────────────────────────────────────────────────────────────

  async addMember(cooperativeId: string, dto: AddMemberDto) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.approval_status !== CooperativeApprovalStatus.APPROVED) {
      throw new BadRequestException('La cooperativa debe estar aprobada para agregar miembros');
    }
    if (coop.status === CooperativeStatus.SUSPENDED) {
      throw new BadRequestException('No se pueden agregar miembros a una cooperativa suspendida');
    }

    const emailExists = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (emailExists) throw new ConflictException('El correo ya está registrado en el sistema');

    const userRole = ROLE_MAP[dto.role];
    const user = await this.usersRepo.save(
      this.usersRepo.create({ email: dto.email, role: userRole, status: UserStatus.ACTIVE }),
    );

    await this.membersRepo.save(
      this.membersRepo.create({ user, cooperative: coop, full_name: dto.full_name, role: dto.role }),
    );

    return {
      message: `Miembro agregado. Puede iniciar sesión con ${dto.email} vía POST /auth/email/request-otp`,
      user_id: user.id,
    };
  }

  async listMembers(cooperativeId: string) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    return this.membersRepo.find({
      where: { cooperative: { id: cooperativeId } },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }

  async removeMember(memberId: string) {
    const member = await this.membersRepo.findOne({
      where: { id: memberId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Miembro no encontrado');

    await this.usersRepo.update(member.user.id, { status: UserStatus.INACTIVE });
    await this.membersRepo.delete(memberId);

    return { message: 'Miembro eliminado y cuenta desactivada' };
  }

  // ── Flota en tiempo real ─────────────────────────────────────────────────────

  async getFleet(cooperativeId: string) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    // Conductores con vehículo activo asignado a esta cooperativa
    const driversWithActiveVehicle = await this.driversRepo
      .createQueryBuilder('driver')
      .innerJoinAndSelect('driver.active_vehicle', 'vehicle')
      .innerJoin('vehicle.cooperative', 'coop', 'coop.id = :coopId', { coopId: cooperativeId })
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.online_status != :offline', { offline: DriverOnlineStatus.OFFLINE })
      .getMany();

    // Viajes activos de estos conductores (para saber si están en viaje)
    const driverIds = driversWithActiveVehicle.map(d => d.id);
    const activeTrips = driverIds.length
      ? await this.tripsRepo.find({
          where: { driver: { id: In(driverIds) }, status: TripStatus.IN_PROGRESS },
          select: ['id', 'driver'],
          relations: ['driver'],
        })
      : [];

    // Build activeTrip map: driver_id → trip_id
    const tripByDriver = new Map<string, string>();
    for (const t of activeTrips) {
      if (t.driver) tripByDriver.set(t.driver.id, t.id);
    }

    const drivers = driversWithActiveVehicle.map(d => ({
      driver_id: d.id,
      driver_name: d.full_name,
      online_status: d.online_status,
      current_lat: d.current_lat ? parseFloat(d.current_lat as any) : null,
      current_lng: d.current_lng ? parseFloat(d.current_lng as any) : null,
      last_seen_at: d.last_seen_at,
      vehicle: d.active_vehicle ? {
        id: d.active_vehicle.id,
        plate: (d.active_vehicle as any).plate,
        brand: (d.active_vehicle as any).brand,
        model: (d.active_vehicle as any).model,
        color: (d.active_vehicle as any).color,
        photo_url: (d.active_vehicle as any).photo_url ?? null,
      } : null,
      active_trip_id: tripByDriver.get(d.id) ?? null,
    }));

    return {
      cooperative_id: cooperativeId,
      cooperative_name: coop.name,
      total: drivers.length,
      online: drivers.filter(d => d.online_status === DriverOnlineStatus.ONLINE).length,
      busy: drivers.filter(d => d.online_status === DriverOnlineStatus.BUSY).length,
      drivers,
    };
  }
}
