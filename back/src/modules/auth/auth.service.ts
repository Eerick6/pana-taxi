import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Twilio } from 'twilio';
import * as nodemailer from 'nodemailer';
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

const STAFF_ROLES = [
  UserRole.OWNER,
  UserRole.PLATFORM_ADMIN,
  UserRole.FINANCE,
  UserRole.SUPPORT,
  UserRole.MONITORING,
  UserRole.COOPERATIVE_ADMIN,
  UserRole.COOPERATIVE_OPERATOR,
  UserRole.COOPERATIVE_SUPERVISOR,
];

@Injectable()
export class AuthService {
  private twilio: Twilio;
  private mailer: nodemailer.Transporter;

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
  ) {
    this.twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.mailer = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_KEY,
      },
    });
  }

  async requestPhoneOtp(dto: OtpRequestDto) {
    const user = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (!user) throw new BadRequestException('Teléfono no registrado');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Cuenta suspendida o inactiva');

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendSms(dto.phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);

    return { message: 'OTP enviado al teléfono' };
  }

  async verifyPhoneOtp(dto: OtpVerifyDto) {
    const user = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (!user) throw new UnauthorizedException('Teléfono no registrado');

    this.validateOtp(user, dto.code);
    await this.usersRepository.update(user.id, { otp_code: null, otp_expires_at: null });
    return this.generateTokens(user);
  }

  async requestEmailOtp(dto: EmailOtpRequestDto) {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Correo no registrado');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Cuenta suspendida o inactiva');
    if (!STAFF_ROLES.includes(user.role)) throw new UnauthorizedException('Este método es solo para staff');

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendEmail(dto.email, code);

    return { message: 'OTP enviado al correo' };
  }

  async verifyEmailOtp(dto: EmailOtpVerifyDto) {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Correo no registrado');

    this.validateOtp(user, dto.code);
    await this.usersRepository.update(user.id, { otp_code: null, otp_expires_at: null });
    return this.generateTokens(user);
  }

  async registerClient(dto: RegisterClientDto) {
    const exists = await this.usersRepository.findOne({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Teléfono ya registrado');

    const cedulaHash = hmacLookup(dto.cedula);
    const cedulaExists = await this.clientsRepository
      .createQueryBuilder('c')
      .addSelect('c.cedula_hash')
      .where('c.cedula_hash = :hash', { hash: cedulaHash })
      .getOne();
    if (cedulaExists) throw new ConflictException('Cédula ya registrada en el sistema');

    const terms = await this.termsService.validateAcceptance(TermsType.CLIENT, dto.terms_version);

    const user = this.usersRepository.create({
      phone: dto.phone,
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      terms_version: terms.version,
      terms_accepted_at: new Date(),
    });
    await this.usersRepository.save(user);

    const client = this.clientsRepository.create({
      user,
      full_name: dto.full_name,
      cedula: dto.cedula,       // auto-encrypted via transformer
      cedula_hash: cedulaHash,  // for unique lookups
    });
    await this.clientsRepository.save(client);

    const { code, expires } = this.generateOtp();
    await this.usersRepository.update(user.id, { otp_code: code, otp_expires_at: expires });
    await this.sendSms(dto.phone, `Tu código de verificación es: ${code}. Expira en 10 minutos.`);

    return { message: 'Registro exitoso. Verifica tu teléfono.' };
  }

  async refresh(token: string) {
    const user = await this.usersRepository.findOne({ where: { refresh_token: token } });
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

  async logout(userId: string) {
    await this.usersRepository.update(userId, { refresh_token: null });
    return { message: 'Sesión cerrada' };
  }

  private generateOtp() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    return { code, expires };
  }

  private get isDev() {
    return process.env.NODE_ENV !== 'production';
  }

  private validateOtp(user: User, code: string) {
    if (this.isDev && code === '000000') return;
    if (!user.otp_code || user.otp_code !== code) throw new UnauthorizedException('Código inválido');
    if (new Date() > user.otp_expires_at) throw new UnauthorizedException('Código expirado');
  }

  private async sendSms(to: string, message: string) {
    if (this.isDev) {
      console.log(`[DEV SMS] → ${to}: ${message}`);
      return;
    }
    await this.twilio.messages.create({ body: message, from: process.env.TWILIO_PHONE, to });
  }

  private async sendEmail(to: string, code: string) {
    if (this.isDev) {
      console.log(`[DEV EMAIL] → ${to}: código ${code}`);
      return;
    }
    await this.mailer.sendMail({
      from: `"TaxiEC" <${process.env.BREVO_FROM}>`,
      to,
      subject: 'Tu código de verificación',
      html: `<p>Tu código de acceso es: <strong style="font-size:24px">${code}</strong></p><p>Expira en 10 minutos.</p>`,
    });
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any,
    });
    await this.usersRepository.update(user.id, { refresh_token });
    return { access_token, refresh_token, role: user.role };
  }
}
