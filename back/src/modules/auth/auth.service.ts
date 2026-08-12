import { Injectable, UnauthorizedException, BadRequestException, ConflictException, HttpException, Logger, Optional, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { NOTIFICATION_QUEUE } from '../../queues/notifications/notification-queue.types';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { PlatformMember } from '../platform/entities/platform-member.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { hmacLookup } from '../../common/transformers/encrypt.transformer';
import { TermsService } from '../terms/terms.service';
import { TermsType } from '../terms/entities/terms-version.entity';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { EmailOtpRequestDto } from './dto/email-otp-request.dto';
import { EmailOtpVerifyDto } from './dto/email-otp-verify.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { EventsGateway } from '../gateway/events.gateway';

const STAFF_ROLES = [
  UserRole.OWNER,
  UserRole.PLATFORM_ADMIN,
  UserRole.FINANCE,
  UserRole.SUPPORT,
  UserRole.MONITORING,
];

const COOP_ROLES = [
  UserRole.COOPERATIVE_ADMIN,
  UserRole.COOPERATIVE_OPERATOR,
  UserRole.COOPERATIVE_SUPERVISOR,
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
    @InjectRepository(PlatformMember)
    private platformMembersRepo: Repository<PlatformMember>,
    @InjectRepository(CooperativeMember)
    private cooperativeMembersRepo: Repository<CooperativeMember>,
    private jwtService: JwtService,
    private termsService: TermsService,
    @Optional() @InjectQueue(NOTIFICATION_QUEUE) private notificationQueue: Queue | null,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private gateway: EventsGateway,
  ) {
  }

  async requestPhoneOtp(dto: OtpRequestDto) {
    const user = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (!user) throw new BadRequestException('Teléfono no registrado');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Tu cuenta ha sido bloqueada. Contacta con soporte en soporte@panataxista.com para más información.');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Tu cuenta está inactiva. Contacta con soporte.');

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendSms(dto.phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);

    if (this.showDevOtp) return { message: 'OTP enviado', dev_code: code };
    return { message: 'OTP enviado al teléfono' };
  }

  async verifyPhoneOtp(dto: OtpVerifyDto) {
    const user = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (!user) throw new UnauthorizedException('Teléfono no registrado');

    if (this.isDev && dto.code === '000000') {
      await this.usersRepository.update(user.id, { otp_code: null, otp_expires_at: null, status: UserStatus.ACTIVE });
      return this.generateTokens({ ...user, status: UserStatus.ACTIVE });
    }

    // UPDATE atómico: consume el OTP solo si aún es válido — previene race condition
    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ otp_code: null, otp_expires_at: null, status: UserStatus.ACTIVE })
      .where('id = :id AND otp_code = :code AND otp_expires_at > NOW()', { id: user.id, code: dto.code })
      .execute();
    if (result.affected === 0) throw new UnauthorizedException('Código inválido o expirado');

    return this.generateTokens({ ...user, status: UserStatus.ACTIVE });
  }

  async requestEmailOtp(dto: EmailOtpRequestDto) {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Correo no registrado');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Tu cuenta ha sido bloqueada. Contacta con soporte en soporte@panataxista.com.');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Tu cuenta está inactiva. Contacta con soporte.');
    if (!STAFF_ROLES.includes(user.role) && !COOP_ROLES.includes(user.role)) throw new UnauthorizedException('Este método es solo para staff');

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendEmail(dto.email, code);

    if (this.showDevOtp) return { message: 'OTP enviado', dev_code: code };
    return { message: 'OTP enviado al correo' };
  }

  async verifyEmailOtp(dto: EmailOtpVerifyDto) {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Correo no registrado');

    if (this.isDev && dto.code === '000000') {
      await this.usersRepository.update(user.id, { otp_code: null, otp_expires_at: null });
      return this.generateTokens(user);
    }

    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ otp_code: null, otp_expires_at: null })
      .where('id = :id AND otp_code = :code AND otp_expires_at > NOW()', { id: user.id, code: dto.code })
      .execute();
    if (result.affected === 0) throw new UnauthorizedException('Código inválido o expirado');

    return this.generateTokens(user);
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

  private async sendSetPasswordEmail(to: string, token: string) {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/set-password?email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;
    try {
      await this.sendBrevoEmail(to, 'Crea tu contraseña — Pana Taxi', `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:20px">
          <h2>Crea tu contraseña de acceso</h2>
          <p>Para acceder al panel de Pana Taxi, establece una contraseña haciendo clic en el botón de abajo. El enlace expira en 24 horas.</p>
          <a href="${link}" style="display:inline-block;background:#fcbd13;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
            Crear mi contraseña →
          </a>
          <p style="color:#888;font-size:12px;margin-top:16px">Si no solicitaste esto, ignora este correo.</p>
        </div>`);
      this.logger.log(`[EMAIL OK] set-password → ${to}`);
    } catch (err) {
      this.logger.error(`[EMAIL FAIL] set-password → ${to} | ${err.message}`);
      throw err;
    }
  }

  async loginWithPhone(phone: string, password: string) {
    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Tu cuenta ha sido bloqueada. Contacta con soporte.');
    if (user.status === UserStatus.INACTIVE && user.otp_code) {
      const { code, expires } = this.generateOtp();
      await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
      await this.sendSms(phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);
      throw new HttpException({
        error: 'PENDING_VERIFICATION',
        message: 'Tu registro está pendiente de verificación. Te enviamos un nuevo código.',
        ...(this.showDevOtp ? { dev_code: code } : {}),
      }, 428);
    }
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Tu cuenta no está activa. Contacta con soporte.');
    if (!user.password_hash) throw new UnauthorizedException('Esta cuenta no tiene contraseña configurada.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Teléfono o contraseña incorrectos');

    return this.generateTokens(user);
  }

  async loginWithPassword(email: string, password: string) {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Correo o contraseña incorrectos');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Tu cuenta ha sido bloqueada. Contacta con soporte en soporte@panataxista.com.');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Tu cuenta está inactiva. Contacta con soporte.');
    if (!user.password_hash) throw new UnauthorizedException('Esta cuenta no tiene contraseña configurada. Usa la recuperación de contraseña.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Correo o contraseña incorrectos');

    return this.generateTokens(user);
  }

  async forgotPassword(email: string) {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user || user.status !== UserStatus.ACTIVE) return { message: 'Si el correo existe, recibirás un enlace de recuperación' };

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });

    await this.sendPasswordResetEmail(email, code);
    return { message: 'Si el correo existe, recibirás un enlace de recuperación' };
  }

  async resendInvite(email: string) {
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) throw new BadRequestException('No existe una cuenta registrada con ese correo');
    if (user.password_hash) throw new BadRequestException('Esta cuenta ya tiene contraseña configurada. Usa "Olvidé mi contraseña" si necesitas recuperarla.');

    // Si ya hay un token válido (expira en más de 1h), reenviar el mismo — no generar uno nuevo
    const hasValidToken = user.otp_code && user.otp_expires_at && user.otp_expires_at > new Date(Date.now() + 60 * 60 * 1000);
    const token = hasValidToken ? user.otp_code : crypto.randomBytes(32).toString('hex');

    if (!hasValidToken) {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepository.update(user.id, { otp_code: token, otp_expires_at: expires });
    }

    await this.sendSetPasswordEmail(email, token).catch((err) => {
      this.logger.error(`resendInvite email failed for ${email}: ${err.message}`);
      throw new Error('No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
    });
    return { message: 'Enlace de activación reenviado. Revisa tu correo.' };
  }

  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) throw new BadRequestException('Token inválido o expirado');

    if (process.env.NODE_ENV !== 'production' && token === '000000') {
      const hash = await bcrypt.hash(newPassword, 12);
      await this.usersRepository.update(user.id, { password_hash: hash, otp_code: null, otp_expires_at: null });
      return { message: 'Contraseña actualizada correctamente' };
    }

    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ otp_code: null, otp_expires_at: null })
      .where('id = :id AND otp_code = :token AND otp_expires_at > NOW()', { id: user.id, token })
      .execute();
    if (result.affected === 0) throw new BadRequestException('Token inválido o expirado');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.usersRepository.update(user.id, { password_hash: hash });
    return { message: 'Contraseña actualizada correctamente' };
  }

  async forgotPasswordPhone(phone: string, role?: 'client' | 'driver') {
    // Rate limit: máximo 3 intentos por número cada 24 horas
    const rateLimitKey = `pwd:forgot:rate:${phone}`;
    const attempts = await this.redis.incr(rateLimitKey);
    if (attempts === 1) {
      await this.redis.expire(rateLimitKey, 24 * 3600);
    }
    if (attempts > 3) {
      const ttl = await this.redis.ttl(rateLimitKey);
      const hoursLeft = Math.ceil(ttl / 3600);
      throw new BadRequestException(
        `Demasiados intentos. Podrás volver a intentarlo en ${hoursLeft} hora${hoursLeft === 1 ? '' : 's'}.`,
      );
    }

    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) throw new BadRequestException('No existe una cuenta registrada con ese número');
    if (role === 'client' && user.role !== UserRole.CLIENT) {
      throw new BadRequestException('No existe una cuenta de pasajero con ese número');
    }
    if (role === 'driver' && ![UserRole.DRIVER, UserRole.OWNER].includes(user.role as UserRole)) {
      throw new BadRequestException('No existe una cuenta de conductor con ese número');
    }
    if (user.status !== UserStatus.ACTIVE) throw new BadRequestException('Esta cuenta está suspendida. Contacta con soporte.');

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendSms(phone, `Tu código para restablecer contraseña en Pana Taxi: ${code}. Expira en 10 minutos.`);
    if (this.showDevOtp) return { message: 'Código enviado', dev_code: code };
    return { message: 'Si el número está registrado, recibirás un código SMS' };
  }

  async resetPasswordPhone(phone: string, otp: string, newPassword: string) {
    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) throw new BadRequestException('Código inválido o expirado');

    // Cooldown: no puede cambiar contraseña más de una vez cada 7 días
    const cooldownKey = `pwd:cooldown:${user.id}`;
    const cooldownTtl = await this.redis.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      const daysLeft = Math.ceil(cooldownTtl / 86400);
      throw new BadRequestException(
        `Ya cambiaste tu contraseña recientemente. Podrás volver a cambiarla en ${daysLeft} día${daysLeft === 1 ? '' : 's'}.`,
      );
    }

    if (process.env.NODE_ENV !== 'production' && otp === '000000') {
      const hash = await bcrypt.hash(newPassword, 12);
      await this.usersRepository.update(user.id, { password_hash: hash, otp_code: null, otp_expires_at: null });
      await this.redis.set(cooldownKey, '1', 'EX', 7 * 24 * 3600);
      return { message: 'Contraseña actualizada correctamente' };
    }

    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ otp_code: null, otp_expires_at: null })
      .where('id = :id AND otp_code = :otp AND otp_expires_at > NOW()', { id: user.id, otp })
      .execute();
    if (result.affected === 0) throw new BadRequestException('Código inválido o expirado');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.usersRepository.update(user.id, { password_hash: hash });
    await this.redis.set(cooldownKey, '1', 'EX', 7 * 24 * 3600);
    return { message: 'Contraseña actualizada correctamente' };
  }

  async registerClient(dto: RegisterClientDto) {
    const exists = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (exists) {
      // Si existe pero nunca verificó (aún tiene otp_code), reenviar el código
      if (exists.otp_code) {
        const { code, expires } = this.generateOtp();
        await this.usersRepository.update(exists.id, { otp_code: code, otp_expires_at: expires });
        await this.sendSms(dto.phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);
        if (this.showDevOtp) return { message: 'Código reenviado', dev_code: code };
        return { message: 'Código reenviado al teléfono' };
      }
      throw new ConflictException('Teléfono ya registrado');
    }

    const cedulaHash = hmacLookup(dto.cedula);
    const cedulaExists = await this.clientsRepository
      .createQueryBuilder('c')
      .addSelect('c.cedula_hash')
      .where('c.cedula_hash = :hash', { hash: cedulaHash })
      .getOne();
    if (cedulaExists) throw new ConflictException('Cédula ya registrada en el sistema');

    const terms = await this.termsService.validateAcceptance(TermsType.CLIENT, dto.terms_version);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepository.create({
      phone: dto.phone,
      role: UserRole.CLIENT,
      status: UserStatus.INACTIVE,
      terms_version: terms.version,
      terms_accepted_at: new Date(),
      password_hash: passwordHash,
    });
    await this.usersRepository.save(user);

    const client = this.clientsRepository.create({
      user,
      full_name: dto.full_name,
      cedula: dto.cedula,       // auto-encrypted via transformer
      cedula_hash: cedulaHash,  // for unique lookups
    });
    await this.clientsRepository.save(client);
    this.gateway.notifyPlatform('client.registered', { client_id: client.id });

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendSms(dto.phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);

    if (this.showDevOtp) return { message: 'Registro exitoso. Verifica tu teléfono.', dev_code: code };
    return { message: 'Registro exitoso. Verifica tu teléfono.' };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async refresh(token: string) {
    const hash = this.hashToken(token);
    const user = await this.usersRepository.findOne({ where: { refresh_token: hash } });
    if (!user) throw new UnauthorizedException('Refresh token inválido');

    try {
      this.jwtService.verify(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      await this.usersRepository.update(user.id, { refresh_token: null });
      throw new UnauthorizedException('Refresh token expirado');
    }

    return this.generateTokens(user);
  }

  async getMe(userId: string, role: UserRole) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (COOP_ROLES.includes(role)) {
      const coopMember = await this.cooperativeMembersRepo.findOne({
        where: { user: { id: userId } },
        relations: ['cooperative'],
      });
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: coopMember?.full_name ?? user.email,
        cooperative_id: coopMember?.cooperative?.id ?? null,
      };
    }

    if (STAFF_ROLES.includes(role)) {
      const member = await this.platformMembersRepo.findOne({ where: { user: { id: userId } } });
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: member?.full_name ?? 'Administrador',
        cooperative_id: null,
      };
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.email,
      cooperative_id: null,
    };
  }

  async logout(userId: string) {
    await this.usersRepository.update(userId, { refresh_token: null });
    return { message: 'Sesión cerrada' };
  }

  private generateOtp() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    return { code, expires };
  }

  async adminGetOtp(phone: string) {
    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user || !user.otp_code) return { found: false };
    const expired = user.otp_expires_at ? new Date(user.otp_expires_at) < new Date() : true;
    return {
      found: true,
      phone,
      otp_code: user.otp_code,
      expires_at: user.otp_expires_at,
      expired,
    };
  }

  private get isDev() {
    return process.env.NODE_ENV !== 'production';
  }

  private get showDevOtp() {
    return this.isDev || process.env.SHOW_DEV_OTP === 'true';
  }

  private validateOtp(user: User, code: string) {
    if (this.isDev && code === '000000') return;
    if (!user.otp_code || user.otp_code !== code) throw new UnauthorizedException('Código inválido');
    if (new Date() > user.otp_expires_at) throw new UnauthorizedException('Código expirado');
  }

  private async sendSms(to: string, message: string) {
    if (this.isDev) {
      this.logger.log(`[DEV SMS] → ${to}: ${message}`);
      return;
    }
    try {
      await this.sendZavuSms(to, message);
      this.logger.log(`[SMS OK] → ${to}`);
    } catch (err) {
      this.logger.error(`[SMS FAIL] → ${to} | ${err.message}`);
    }
  }

  private async sendZavuSms(to: string, text: string): Promise<void> {
    const res = await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ZAVU_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Zavu SMS ${res.status}: ${err}`);
    }
  }

  private async sendPasswordResetEmail(to: string, code: string) {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/reset-password?email=${encodeURIComponent(to)}&token=${code}`;
    try {
      await this.sendBrevoEmail(to, 'Recuperación de contraseña — Pana Taxi', `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Recuperar contraseña</h2>
          <p>Haz clic en el botón para establecer una nueva contraseña. El enlace expira en 10 minutos.</p>
          <a href="${link}" style="display:inline-block;background:#fcbd13;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
            Restablecer contraseña
          </a>
          <p style="color:#888;font-size:12px;margin-top:16px">Si no solicitaste esto, ignora este correo.</p>
        </div>`);
      this.logger.log(`[EMAIL OK] reset-password → ${to}`);
    } catch (err) {
      this.logger.error(`[EMAIL FAIL] reset-password → ${to} | ${err.message}`);
      throw err;
    }
  }

  async sendCoopReviewEmail(to: string, coopName: string) {
    this.logger.log(`[COOP REVIEW EMAIL] → ${to}: cooperativa ${coopName}`);
    await this.sendBrevoEmail(to, `Tu cooperativa "${coopName}" está siendo revisada — Pana Taxi`, `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>¡Registro recibido!</h2>
        <p>Hemos recibido la solicitud de registro de la cooperativa <strong>${coopName}</strong>.</p>
        <p>Nuestro equipo revisará la documentación y te notificará por este correo cuando sea aprobada. El proceso generalmente toma menos de 24 horas.</p>
        <p>Puedes <a href="${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/signin">iniciar sesión</a> en el panel para subir tus documentos mientras tanto.</p>
        <p style="color:#888;font-size:12px">Si tienes preguntas, escríbenos a soporte@panataxista.com</p>
      </div>`);
  }

  private async sendEmail(to: string, code: string) {
    await this.sendBrevoEmail(to, 'Tu código de verificación — Pana Taxi',
      `<p>Tu código de acceso es: <strong style="font-size:24px">${code}</strong></p><p>Expira en 10 minutos.</p>`);
  }

  private async generateTokens(user: User) {
    let cooperative_id: string | null = null;
    if (COOP_ROLES.includes(user.role)) {
      const membership = await this.cooperativeMembersRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['cooperative'],
      });
      cooperative_id = membership?.cooperative?.id ?? null;
    }

    const payload = { sub: user.id, role: user.role, cooperative_id };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any,
    });
    await this.usersRepository.update(user.id, { refresh_token: this.hashToken(refresh_token) });
    return { access_token, refresh_token, role: user.role };
  }
}
