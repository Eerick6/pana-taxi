import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
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
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';
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

const DOC_TYPE_LABEL: Record<string, string> = {
  ruc: 'RUC de la cooperativa',
  ant_permit: 'Permiso de operación ANT/GADM',
  seps_resolution: 'Resolución SEPS de constitución',
  statutes: 'Estatutos aprobados',
  representative_id: 'Cédula del representante legal',
  representative_appointment: 'Nombramiento del representante',
  other: 'Otro documento',
};

@Injectable()
export class CooperativesService {
  private readonly logger = new Logger(CooperativesService.name);
  private readonly isDev = process.env.NODE_ENV !== 'production';

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
    private notifications: NotificationsService,
    private gateway: EventsGateway,
  ) {
  }

  private async sendBrevoEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY no configurado');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Pana Taxi', email: process.env.BREVO_FROM },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Brevo API ${res.status}: ${errText}`);
    }
  }

  private async sendDocumentNotification(
    to: string,
    coopName: string,
    docType: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ) {
    const label = DOC_TYPE_LABEL[docType] ?? docType;
    const subject = status === 'approved'
      ? `✅ Documento aprobado — ${coopName}`
      : `❌ Documento rechazado — ${coopName}`;

    const html = status === 'approved'
      ? `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#22c55e">Documento aprobado</h2>
          <p>El documento <strong>${label}</strong> de la cooperativa <strong>${coopName}</strong> ha sido <strong style="color:#22c55e">aprobado</strong> por la plataforma.</p>
          <p>Ingresa al panel para ver el estado actualizado de tus documentos.</p>
        </div>`
      : `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#ef4444">Documento rechazado</h2>
          <p>El documento <strong>${label}</strong> de la cooperativa <strong>${coopName}</strong> ha sido <strong style="color:#ef4444">rechazado</strong>.</p>
          ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
          <p>Por favor sube el documento corregido desde el panel de administración.</p>
        </div>`;

    await this.sendBrevoEmail(to, subject, html);
  }

  private async sendCoopReviewEmail(to: string, coopName: string, inviteToken: string) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const setPasswordLink = `${frontendUrl}/set-password?email=${encodeURIComponent(to)}&token=${encodeURIComponent(inviteToken)}`;
    try {
      await this.sendBrevoEmail(to, `Tu cooperativa "${coopName}" está siendo revisada — Pana Taxi`, `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
          <h2 style="color:#1a1a1a">¡Registro recibido!</h2>
          <p>Hemos recibido la solicitud de registro de la cooperativa <strong>${coopName}</strong>. Nuestro equipo revisará la información y te notificará cuando sea aprobada (menos de 24 horas).</p>
          <p><strong>Paso 1:</strong> Crea tu contraseña haciendo clic en el botón de abajo. El enlace expira en 24 horas.</p>
          <a href="${setPasswordLink}" style="display:inline-block;background:#fcbd13;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0">
            Crear mi contraseña →
          </a>
          <p><strong>Paso 2:</strong> Una vez creada tu contraseña, podrás iniciar sesión en el panel para subir los documentos requeridos.</p>
          <p><strong>Paso 3:</strong> Cuando tu cooperativa sea aprobada, recibirás otro correo de confirmación y podrás operar en la plataforma.</p>
          <p style="color:#888;font-size:12px;margin-top:20px">¿Preguntas? Escríbenos a soporte@panataxista.com</p>
        </div>`);
      this.logger.log(`[EMAIL OK] coop-review → ${to}`);
    } catch (err) {
      this.logger.error(`[EMAIL FAIL] coop-review → ${to} | ${err.message}`);
      throw err;
    }
  }

  private async sendStaffInviteEmail(to: string, fullName: string, coopName: string, inviteToken: string) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const setPasswordLink = `${frontendUrl}/set-password?email=${encodeURIComponent(to)}&token=${encodeURIComponent(inviteToken)}`;
    await this.sendBrevoEmail(to, `Te invitaron a gestionar la cooperativa "${coopName}" — Pana Taxi`, `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
        <h2 style="color:#1a1a1a">¡Hola, ${fullName}!</h2>
        <p>Has sido añadido como miembro del equipo de <strong>${coopName}</strong> en la plataforma Pana Taxi.</p>
        <p>Para acceder al panel, primero crea tu contraseña haciendo clic en el botón de abajo. El enlace expira en 48 horas.</p>
        <a href="${setPasswordLink}" style="display:inline-block;background:#fcbd13;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0">
          Crear mi contraseña →
        </a>
        <p>Una vez creada tu contraseña, podrás iniciar sesión en <a href="${frontendUrl}/signin">el panel</a> con este correo.</p>
        <p style="color:#888;font-size:12px;margin-top:20px">¿Preguntas? Escríbenos a soporte@panataxista.com</p>
      </div>`);
  }

  async sendCoopApprovedEmail(to: string, coopName: string) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    await this.sendBrevoEmail(to, `¡Tu cooperativa "${coopName}" fue aprobada! — Pana Taxi`, `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
        <h2 style="color:#16a34a">¡Cooperativa aprobada!</h2>
        <p>La cooperativa <strong>${coopName}</strong> ha sido revisada y aprobada por el equipo de Pana Taxi.</p>
        <p>Ya puedes iniciar sesión en el panel y comenzar a gestionar tu cooperativa, registrar socios y operar en la plataforma.</p>
        <a href="${frontendUrl}/signin" style="display:inline-block;background:#fcbd13;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0">
          Ir al panel →
        </a>
        <p style="color:#888;font-size:12px;margin-top:20px">¿Preguntas? Escríbenos a soporte@panataxista.com</p>
      </div>`);
  }

  // ─── Notificar admins de plataforma ──────────────────────────────────────────

  private async notifyPlatformAdmins(payload: { title: string; body: string }) {
    const admins = await this.usersRepo.find({
      where: [{ role: UserRole.OWNER }, { role: UserRole.PLATFORM_ADMIN }],
      select: ['id'],
    });
    const ids = admins.map((u) => u.id);
    if (ids.length) this.notifications.sendToUsers(ids, payload).catch(() => {});
  }

  // ─── Registro público (sin auth) ─────────────────────────────────────────────

  async registerPublic(dto: {
    name: string;
    ruc: string;
    address?: string;
    phone?: string;
    latitude?: number;
    longitude?: number;
    admin_name: string;
    admin_email: string;
  }) {
    const nameExists = await this.coopRepo.findOne({ where: { name: dto.name } });
    if (nameExists) throw new ConflictException('Ya existe una cooperativa con ese nombre');

    const rucExists = await this.coopRepo.findOne({ where: { ruc: dto.ruc } });
    if (rucExists) throw new ConflictException('Ya existe una cooperativa con ese RUC');

    const emailExists = await this.usersRepo.findOne({ where: { email: dto.admin_email } });
    if (emailExists) throw new ConflictException('El correo ya está registrado. Inicia sesión en el panel.');

    // Crear cooperativa en estado pending
    const coop = await this.coopRepo.save(
      this.coopRepo.create({
        name: dto.name,
        ruc: dto.ruc,
        address: dto.address,
        phone: dto.phone,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        status: CooperativeStatus.INACTIVE,
        approval_status: CooperativeApprovalStatus.PENDING,
      }),
    );

    // Crear usuario admin de la cooperativa (sin contraseña aún — la crea desde el email)
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: dto.admin_email,
        role: UserRole.COOPERATIVE_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );

    // Generar token de 24h para que el admin cree su contraseña
    const inviteCode = Math.floor(100000 + Math.random() * 900000).toString() + Date.now().toString(36);
    const inviteExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, { otp_code: inviteCode, otp_expires_at: inviteExpires });

    // Vincular como miembro admin
    await this.membersRepo.save(
      this.membersRepo.create({
        user,
        cooperative: coop,
        full_name: dto.admin_name,
        role: CooperativeMemberRole.ADMIN,
      }),
    );

    this.notifyPlatformAdmins({
      title: '🏢 Nueva cooperativa registrada',
      body: `${dto.name} se registró y está pendiente de verificación.`,
    });
    this.gateway.notifyPlatform('cooperative.registered', { cooperative_id: coop.id });

    await this.sendCoopReviewEmail(dto.admin_email, dto.name, inviteCode).catch((e) =>
      this.logger.error(`sendCoopReviewEmail failed for ${dto.admin_email}: ${e.message}`),
    );

    return {
      cooperative_id: coop.id,
      admin_email: dto.admin_email,
      message: 'Registro exitoso. Revisa tu correo para crear tu contraseña y continuar.',
    };
  }

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

    this.gateway.notifyPlatform('cooperative.registered', { cooperative_id: coop.id });

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

  async listActive(page = 1, limit = 50) {
    const [items, total] = await this.coopRepo.findAndCount({
      where: { approval_status: CooperativeApprovalStatus.APPROVED, status: CooperativeStatus.ACTIVE },
      select: ['id', 'name', 'address', 'phone', 'logo_url'],
      skip: (page - 1) * limit,
      take: limit,
      order: { name: 'ASC' },
    });
    return { items, total };
  }

  async findOne(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    const member_count = await this.membersRepo.count({ where: { cooperative: { id } } });
    return { ...coop, member_count };
  }

  async updateProfile(id: string, dto: { phone?: string; address?: string; latitude?: number; longitude?: number }) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    await this.coopRepo.update(id, dto);
    return { message: 'Perfil actualizado' };
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

  async setMonthlyFee(id: string, fee: number) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (fee < 0) throw new BadRequestException('El costo mensual no puede ser negativo');
    await this.coopRepo.update(id, { monthly_fee_override: fee });
    return { message: `Costo mensual actualizado a $${fee}`, monthly_fee_override: fee };
  }

  async remove(id: string) {
    const coop = await this.coopRepo.findOne({ where: { id } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');
    if (coop.status === CooperativeStatus.ACTIVE) {
      throw new BadRequestException('No se puede eliminar una cooperativa activa. Suspéndela primero.');
    }
    await this.coopRepo.delete(id);
    return { message: 'Cooperativa eliminada' };
  }

  // ─── DOCUMENTOS ──────────────────────────────────────────────────────────────

  async uploadDocument(
    cooperativeId: string,
    dto: UploadCooperativeDocumentDto,
    file: Express.Multer.File,
  ) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

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

    this.notifyPlatformAdmins({
      title: '📄 Documento subido',
      body: `${coop.name} subió un documento pendiente de revisión.`,
    });

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

    // Notificar al admin de la coop por correo
    const adminMember = await this.membersRepo.findOne({
      where: { cooperative: { id }, role: CooperativeMemberRole.ADMIN },
      relations: ['user'],
    });
    if (adminMember?.user?.email) {
      this.sendCoopApprovedEmail(adminMember.user.email, coop.name).catch((e) =>
        this.logger.error(`sendCoopApprovedEmail failed: ${e.message}`),
      );
    }
    this.gateway.notifyPlatform('cooperative.approved', { cooperative_id: id });

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
    this.gateway.notifyPlatform('cooperative.rejected', { cooperative_id: id });

    return { message: 'Cooperativa rechazada' };
  }

  // ─── APROBACIÓN DE DOCUMENTOS ────────────────────────────────────────────────

  async approveDocument(cooperativeId: string, docId: string) {
    const doc = await this.documentsRepo.findOne({
      where: { id: docId, cooperative: { id: cooperativeId } },
      relations: ['cooperative'],
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === CooperativeDocumentStatus.APPROVED) {
      throw new BadRequestException('El documento ya está aprobado');
    }

    await this.documentsRepo.update(docId, {
      status: CooperativeDocumentStatus.APPROVED,
      rejection_reason: null,
    });

    // Notificar al admin de la cooperativa
    const adminMember = await this.membersRepo.findOne({
      where: { cooperative: { id: cooperativeId }, role: CooperativeMemberRole.ADMIN },
      relations: ['user'],
    });
    if (adminMember?.user?.email) {
      this.sendDocumentNotification(
        adminMember.user.email,
        doc.cooperative.name,
        doc.type,
        'approved',
      ).catch(() => {});
    }

    return { message: 'Documento aprobado' };
  }

  async rejectDocument(cooperativeId: string, docId: string, dto: RejectCooperativeDocumentDto) {
    const doc = await this.documentsRepo.findOne({
      where: { id: docId, cooperative: { id: cooperativeId } },
      relations: ['cooperative'],
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === CooperativeDocumentStatus.APPROVED) {
      throw new BadRequestException('No se puede rechazar un documento ya aprobado');
    }

    await this.documentsRepo.update(docId, {
      status: CooperativeDocumentStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    // Notificar al admin de la cooperativa
    const adminMember = await this.membersRepo.findOne({
      where: { cooperative: { id: cooperativeId }, role: CooperativeMemberRole.ADMIN },
      relations: ['user'],
    });
    if (adminMember?.user?.email) {
      this.sendDocumentNotification(
        adminMember.user.email,
        doc.cooperative.name,
        doc.type,
        'rejected',
        dto.reason,
      ).catch(() => {});
    }

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

    // Enviar invitación con link para crear contraseña (token 48h)
    const inviteCode = Math.floor(100000 + Math.random() * 900000).toString() + Date.now().toString(36);
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, { otp_code: inviteCode, otp_expires_at: inviteExpires });
    await this.sendStaffInviteEmail(dto.email, dto.full_name, coop.name, inviteCode).catch((e) =>
      this.logger.error(`sendStaffInviteEmail failed for ${dto.email}: ${e.message}`),
    );

    return {
      message: `Miembro agregado. Se envió un correo de invitación a ${dto.email} para crear su contraseña.`,
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

  // ── Socios (owner-drivers) ────────────────────────────────────────────────────

  async listOwners(cooperativeId: string, status?: string, page = 1, limit = 100) {
    const coop = await this.coopRepo.findOne({ where: { id: cooperativeId } });
    if (!coop) throw new NotFoundException('Cooperativa no encontrada');

    const where: Record<string, unknown> = { cooperative: { id: cooperativeId } };
    if (status) where['approval_status'] = status;

    const [items, total] = await this.coopOwnersRepo.findAndCount({
      where,
      relations: ['owner', 'owner.user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'ASC' },
    });
    return { items, total, page, limit };
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
