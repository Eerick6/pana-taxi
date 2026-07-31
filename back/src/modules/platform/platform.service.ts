import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformMember } from './entities/platform-member.entity';
import { SystemConfig } from './entities/system-config.entity';
import { CooperativeSubscription, SubscriptionStatus } from './entities/cooperative-subscription.entity';
import { ContactLead, LeadStatus } from './entities/contact-lead.entity';
import { Cooperative, CooperativeApprovalStatus, CooperativeStatus } from '../cooperatives/entities/cooperative.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SetConfigDto } from './dto/set-config.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { SubmitCoopApplicationDto } from './dto/submit-coop-application.dto';
import { CooperativeApplication, CoopApplicationStatus } from './entities/cooperative-application.entity';

const DEFAULT_CONFIGS: { key: string; value: string; description: string }[] = [
  { key: 'commission_rate', value: '10', description: 'Comisión global por viaje (%). Cada cooperativa puede tener su propio porcentaje.' },
  { key: 'monthly_fee', value: '50', description: 'Mensualidad base para cooperativas (USD). Cada cooperativa puede tener su propio valor.' },
  { key: 'contact_phone', value: '+593987216789', description: 'Número de teléfono/WhatsApp público mostrado en el sitio web.' },
  { key: 'contact_email', value: 'contacto@panataxiapp.com', description: 'Correo electrónico público de contacto mostrado en el sitio web.' },
  { key: 'social_links', value: JSON.stringify({ whatsapp: { enabled: true }, facebook: { enabled: false, url: '' }, instagram: { enabled: false, url: '' }, tiktok: { enabled: false, url: '' }, youtube: { enabled: false, url: '' } }), description: 'Redes sociales mostradas en el sitio web (JSON).' },
];

const PUBLIC_CONFIG_KEYS = ['contact_phone', 'contact_email', 'social_links'];

@Injectable()
export class PlatformService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PlatformMember)
    private membersRepo: Repository<PlatformMember>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(SystemConfig)
    private configRepo: Repository<SystemConfig>,
    @InjectRepository(CooperativeSubscription)
    private subscriptionsRepo: Repository<CooperativeSubscription>,
    @InjectRepository(ContactLead)
    private leadsRepo: Repository<ContactLead>,
    @InjectRepository(Cooperative)
    private cooperativesRepo: Repository<Cooperative>,
    @InjectRepository(CooperativeApplication)
    private coopApplicationsRepo: Repository<CooperativeApplication>,
  ) {}

  async onApplicationBootstrap() {
    // Seed owner account
    const ownerExists = await this.usersRepo.findOne({ where: { role: UserRole.OWNER } });
    if (!ownerExists) {
      const email = process.env.OWNER_EMAIL ?? 'owner@taxiplatform.com';
      const user = await this.usersRepo.save(
        this.usersRepo.create({ email, role: UserRole.OWNER, status: UserStatus.ACTIVE }),
      );
      await this.membersRepo.save(
        this.membersRepo.create({ user, full_name: 'Administrador Principal' }),
      );
      console.log(`[PLATFORM] Owner account created → ${email} (login: POST /auth/email-otp/request)`);
    }

    // Seed default configs if missing
    for (const cfg of DEFAULT_CONFIGS) {
      const exists = await this.configRepo.findOne({ where: { key: cfg.key } });
      if (!exists) {
        await this.configRepo.save(this.configRepo.create(cfg));
        console.log(`[PLATFORM] Config seeded: ${cfg.key} = ${cfg.value}`);
      }
    }
  }

  // ── Staff ────────────────────────────────────────────────────────────────────

  async createStaff(dto: CreateStaffDto) {
    const emailExists = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (emailExists) throw new ConflictException('El correo ya está registrado en el sistema');

    const user = await this.usersRepo.save(
      this.usersRepo.create({ email: dto.email, role: dto.role, status: UserStatus.ACTIVE }),
    );
    await this.membersRepo.save(
      this.membersRepo.create({ user, full_name: dto.full_name }),
    );

    return {
      message: `Staff creado. Puede iniciar sesión con ${dto.email} vía POST /auth/email-otp/request`,
      user_id: user.id,
    };
  }

  async listStaff(page = 1, limit = 20) {
    const [items, total] = await this.membersRepo.findAndCount({
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async getStaff(id: string) {
    const member = await this.membersRepo.findOne({ where: { id }, relations: ['user'] });
    if (!member) throw new NotFoundException('Miembro no encontrado');
    return member;
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    const member = await this.membersRepo.findOne({ where: { id } });
    if (!member) throw new NotFoundException('Miembro no encontrado');
    await this.membersRepo.update(id, dto);
    return { message: 'Miembro actualizado' };
  }

  async removeStaff(id: string) {
    const member = await this.membersRepo.findOne({ where: { id }, relations: ['user'] });
    if (!member) throw new NotFoundException('Miembro no encontrado');
    if (member.user.role === UserRole.OWNER) {
      throw new ConflictException('No se puede eliminar al owner principal');
    }
    await this.usersRepo.update(member.user.id, { status: UserStatus.INACTIVE });
    await this.membersRepo.delete(id);
    return { message: 'Staff eliminado y cuenta desactivada' };
  }

  // ── Configuración global ─────────────────────────────────────────────────────

  async listConfigs() {
    const configs = await this.configRepo.find({ order: { key: 'ASC' } });
    return configs.map((c) => ({
      key: c.key,
      value: c.value,
      description: c.description,
      updated_at: c.updated_at,
    }));
  }

  async getConfig(key: string) {
    const config = await this.configRepo.findOne({ where: { key } });
    if (!config) throw new NotFoundException(`Configuración '${key}' no encontrada`);
    return config;
  }

  async getPublicConfig(): Promise<Record<string, string>> {
    const configs = await this.configRepo.find();
    const result: Record<string, string> = {};
    for (const cfg of configs) {
      if (PUBLIC_CONFIG_KEYS.includes(cfg.key)) result[cfg.key] = cfg.value;
    }
    return result;
  }

  async submitLead(dto: SubmitLeadDto) {
    const lead = await this.leadsRepo.save(this.leadsRepo.create(dto));
    return { message: 'Solicitud recibida correctamente', id: lead.id };
  }

  async listLeads(page = 1, limit = 20, status?: LeadStatus) {
    const where: Partial<ContactLead> = status ? { status } : {};
    const [items, total] = await this.leadsRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async updateLeadStatus(id: string, status: LeadStatus) {
    const lead = await this.leadsRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Solicitud no encontrada');
    await this.leadsRepo.update(id, { status });
    return { message: 'Estado actualizado', id, status };
  }

  async deleteLead(id: string) {
    const lead = await this.leadsRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Solicitud no encontrada');
    await this.leadsRepo.delete(id);
    return { message: 'Solicitud eliminada' };
  }

  // ── Solicitudes de registro de cooperativas ──────────────────────────────────

  async submitCoopApplication(dto: SubmitCoopApplicationDto) {
    const existing = await this.coopApplicationsRepo.findOne({ where: { ruc: dto.ruc } });
    if (existing) throw new ConflictException('Ya existe una solicitud con ese RUC');
    const app = await this.coopApplicationsRepo.save(this.coopApplicationsRepo.create(dto));
    return { message: 'Solicitud de registro recibida. Te contactaremos en menos de 24 horas.', id: app.id };
  }

  async listCoopApplications(page = 1, limit = 20, status?: CoopApplicationStatus) {
    const where = status ? { status } : {};
    const [items, total] = await this.coopApplicationsRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async updateCoopApplicationStatus(id: string, status: CoopApplicationStatus) {
    const app = await this.coopApplicationsRepo.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Solicitud no encontrada');
    await this.coopApplicationsRepo.update(id, { status });
    return { message: 'Estado actualizado', id, status };
  }

  async deleteCoopApplication(id: string) {
    const app = await this.coopApplicationsRepo.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Solicitud no encontrada');
    await this.coopApplicationsRepo.delete(id);
    return { message: 'Solicitud eliminada' };
  }

  async setConfig(key: string, dto: SetConfigDto, userId: string) {
    const allowedKeys = DEFAULT_CONFIGS.map((c) => c.key);
    if (!allowedKeys.includes(key)) {
      throw new BadRequestException(`Clave '${key}' no permitida. Claves válidas: ${allowedKeys.join(', ')}`);
    }

    const numericKeys = ['commission_rate', 'monthly_fee'];
    if (numericKeys.includes(key)) {
      const num = parseFloat(dto.value);
      if (isNaN(num) || num < 0) {
        throw new BadRequestException(`El valor de '${key}' debe ser un número positivo`);
      }
      if (key === 'commission_rate' && num > 100) {
        throw new BadRequestException('La comisión no puede superar el 100%');
      }
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    let config = await this.configRepo.findOne({ where: { key } });
    if (config) {
      config.value = dto.value;
      if (dto.description) config.description = dto.description;
      config.updated_by = user;
      await this.configRepo.save(config);
    } else {
      config = await this.configRepo.save(
        this.configRepo.create({ key, value: dto.value, description: dto.description, updated_by: user }),
      );
    }

    return { message: `Configuración '${key}' actualizada a ${dto.value}`, key, value: dto.value };
  }

  // ── Mensualidades ────────────────────────────────────────────────────────────

  async listSubscriptions(
    page = 1, limit = 20,
    filters: { status?: SubscriptionStatus; cooperative_id?: string; year?: number; month?: number } = {},
  ) {
    const qb = this.subscriptionsRepo.createQueryBuilder('sub')
      .leftJoinAndSelect('sub.cooperative', 'coop')
      .orderBy('sub.year', 'DESC')
      .addOrderBy('sub.month', 'DESC')
      .addOrderBy('coop.name', 'ASC');

    if (filters.status) qb.andWhere('sub.status = :status', { status: filters.status });
    if (filters.cooperative_id) qb.andWhere('coop.id = :coopId', { coopId: filters.cooperative_id });
    if (filters.year) qb.andWhere('sub.year = :year', { year: filters.year });
    if (filters.month) qb.andWhere('sub.month = :month', { month: filters.month });

    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

    const summary = await this.subscriptionsRepo.createQueryBuilder('sub')
      .select('sub.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(sub.amount)', 'total')
      .groupBy('sub.status')
      .getRawMany();

    return { items, total, page, limit, summary };
  }

  async generateMonthlySubscriptions(month: number, year: number, userId: string) {
    if (month < 1 || month > 12) throw new BadRequestException('Mes inválido (1-12)');

    const existing = await this.subscriptionsRepo.count({
      where: { month, year },
    });
    if (existing > 0) {
      throw new ConflictException(`Ya se generaron mensualidades para ${month}/${year} (${existing} registros)`);
    }

    const feeConfig = await this.configRepo.findOne({ where: { key: 'monthly_fee' } });
    const defaultFee = feeConfig ? parseFloat(feeConfig.value) : 50;

    const coops = await this.cooperativesRepo.find({
      where: {
        approval_status: CooperativeApprovalStatus.APPROVED,
        status: CooperativeStatus.ACTIVE,
      },
    });

    if (coops.length === 0) {
      return { message: 'No hay cooperativas activas para facturar', generated: 0 };
    }

    const subscriptions = coops.map((coop) => {
      const amount = coop.monthly_fee_override != null
        ? parseFloat(coop.monthly_fee_override as any)
        : defaultFee;
      return this.subscriptionsRepo.create({ cooperative: coop, month, year, amount });
    });

    await this.subscriptionsRepo.save(subscriptions);

    return {
      message: `Mensualidades generadas para ${month}/${year}`,
      generated: subscriptions.length,
      default_fee: defaultFee,
    };
  }

  async markSubscriptionPaid(id: string, dto: MarkPaidDto) {
    const sub = await this.subscriptionsRepo.findOne({ where: { id }, relations: ['cooperative'] });
    if (!sub) throw new NotFoundException('Mensualidad no encontrada');
    if (sub.status === SubscriptionStatus.PAID) {
      throw new ConflictException('Esta mensualidad ya está marcada como pagada');
    }

    sub.status = SubscriptionStatus.PAID;
    sub.paid_at = new Date();
    if (dto.notes) sub.notes = dto.notes;
    await this.subscriptionsRepo.save(sub);

    return {
      message: `Mensualidad de ${sub.cooperative.name} (${sub.month}/${sub.year}) marcada como pagada`,
      id: sub.id,
      amount: sub.amount,
      paid_at: sub.paid_at,
    };
  }

  async markSubscriptionOverdue(id: string) {
    const sub = await this.subscriptionsRepo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Mensualidad no encontrada');
    if (sub.status === SubscriptionStatus.PAID) {
      throw new ConflictException('No se puede marcar como vencida una mensualidad ya pagada');
    }
    sub.status = SubscriptionStatus.OVERDUE;
    await this.subscriptionsRepo.save(sub);
    return { message: 'Mensualidad marcada como vencida', id };
  }
}
