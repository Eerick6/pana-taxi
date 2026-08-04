import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SosAlert, SosStatus } from './entities/sos-alert.entity';
import { Client } from '../clients/entities/client.entity';
import { EmergencyContact } from '../clients/entities/emergency-contact.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';

@Injectable()
export class SosService {
  constructor(
    @InjectRepository(SosAlert)
    private alertsRepo: Repository<SosAlert>,
    @InjectRepository(Client)
    private clientsRepo: Repository<Client>,
    @InjectRepository(EmergencyContact)
    private contactsRepo: Repository<EmergencyContact>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private gateway: EventsGateway,
    private notificationsService: NotificationsService,
  ) {
  }

  async trigger(userId: string, dto: TriggerSosDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const alert = this.alertsRepo.create({
      user_id: userId,
      trip_id: dto.trip_id ?? null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      message: dto.message ?? null,
    });
    await this.alertsRepo.save(alert);

    const locationStr = dto.lat && dto.lng
      ? `https://maps.google.com/?q=${dto.lat},${dto.lng}`
      : 'ubicación no disponible';

    // Push a staff de plataforma con rol SUPPORT/MONITORING (via sus tokens FCM individuales)
    // Por ahora notificamos a la sala platform via WebSocket; FCM para staff se agrega cuando
    // registren tokens desde el panel web.

    // Notify platform staff via WebSocket immediately
    this.gateway.notifyPlatform('sos.triggered', {
      alert_id: alert.id,
      user_id: userId,
      user_phone: user.phone,
      trip_id: dto.trip_id ?? null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      message: dto.message ?? null,
      triggered_at: alert.triggered_at,
    });

    // If there's an active trip, notify that room too
    if (dto.trip_id) {
      this.gateway.notifyTripUpdate(dto.trip_id, 'sos.triggered', {
        alert_id: alert.id,
        user_id: userId,
      });
    }

    // SMS emergency contacts (clients only — drivers can add later)
    if (user.role === UserRole.CLIENT) {
      const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
      if (client) {
        const contacts = await this.contactsRepo.find({
          where: { client: { id: client.id } },
        });
        const smsText = `🚨 EMERGENCIA: ${client.full_name} ha activado el SOS en la app de taxi. ${locationStr}`;
        await Promise.allSettled(contacts.map(c => this.sendSms(c.phone, smsText)));
      }
    }

    return { alert_id: alert.id, message: 'Alerta SOS enviada' };
  }

  async resolve(alertId: string, resolvedByUserId: string, dto: ResolveSosDto) {
    const alert = await this.alertsRepo.findOne({
      where: { id: alertId },
      relations: ['user'],
    });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    if (alert.status === SosStatus.RESOLVED) {
      throw new BadRequestException('Esta alerta ya fue resuelta');
    }

    await this.alertsRepo.update(alertId, {
      status: SosStatus.RESOLVED,
      resolved_by_id: resolvedByUserId,
      resolved_at: new Date(),
      resolution_notes: dto.resolution_notes ?? null,
    });

    this.gateway.notifyPlatform('sos.resolved', {
      alert_id: alertId,
      resolved_by_id: resolvedByUserId,
    });

    if (alert.user_id) {
      this.gateway.notifyUser(alert.user_id, 'sos.resolved', {
        alert_id: alertId,
        message: 'Tu alerta SOS ha sido atendida.',
      });
    }

    return { message: 'Alerta resuelta' };
  }

  async getAlerts(status?: SosStatus, page = 1, limit = 20) {
    const qb = this.alertsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .leftJoinAndSelect('a.resolved_by', 'rb')
      .orderBy('a.triggered_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.where('a.status = :status', { status });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getAlertById(id: string) {
    const alert = await this.alertsRepo.findOne({
      where: { id },
      relations: ['user', 'resolved_by'],
    });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    return alert;
  }

  private async sendSms(to: string, message: string) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV SOS SMS] → ${to}: ${message}`);
      return;
    }
    const res = await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ZAVU_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text: message }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Zavu SMS SOS ${res.status}: ${err}`);
    }
  }
}
