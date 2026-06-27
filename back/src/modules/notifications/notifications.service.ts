import { Injectable, Logger, OnModuleInit, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from '../users/entities/user.entity';
import { AppNotification, NotificationType } from './entities/app-notification.entity';

export interface PushPayload {
  title: string;
  body: string;
  type?: NotificationType;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private initialized = false;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(AppNotification)
    private notifRepo: Repository<AppNotification>,
  ) {}

  onModuleInit() {
    const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn('FCM_SERVICE_ACCOUNT_JSON no configurado — push notifications deshabilitadas');
      return;
    }
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      this.initialized = true;
      this.logger.log('Firebase Admin SDK inicializado correctamente');
    } catch (err) {
      this.logger.error(`Error inicializando Firebase Admin: ${err.message}`);
    }
  }

  async registerToken(userId: string, token: string) {
    await this.usersRepo.update(userId, { fcm_token: token });
    return { message: 'Token FCM registrado' };
  }

  async removeToken(userId: string) {
    await this.usersRepo.update(userId, { fcm_token: null });
    return { message: 'Token eliminado' };
  }

  // Envía push + persiste en feed para UN usuario
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    // Persist to notification feed (fire-and-forget, never breaks callers)
    this.persistNotification(userId, payload).catch(() => {});

    if (!this.initialized) return;
    const user = await this.usersRepo.findOne({ where: { id: userId }, select: ['fcm_token'] });
    if (user?.fcm_token) await this.sendToToken(user.fcm_token, payload);
  }

  // Envía push + persiste para VARIOS usuarios
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return;

    // Persist to notification feed for all
    userIds.forEach(uid => this.persistNotification(uid, payload).catch(() => {}));

    if (!this.initialized) return;
    const users = await this.usersRepo.find({ where: { id: In(userIds) }, select: ['fcm_token'] });
    const tokens = users.map(u => u.fcm_token).filter(Boolean) as string[];
    if (tokens.length > 0) await this.sendToTokens(tokens, payload);
  }

  async sendToTokenDirect(token: string, payload: PushPayload): Promise<void> {
    if (!this.initialized) return;
    await this.sendToToken(token, payload);
  }

  // ── Feed de notificaciones ──────────────────────────────────────────────────

  async getMyNotifications(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.notifRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notifRepo.count({
      where: { user_id: userId, read_at: IsNull() },
    });
    return { count };
  }

  async markRead(notificationId: string, userId: string) {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId, user_id: userId } });
    if (!notif) throw new NotFoundException('Notificación no encontrada');
    if (notif.read_at) return { message: 'Ya estaba leída' };
    await this.notifRepo.update(notificationId, { read_at: new Date() });
    return { message: 'Marcada como leída' };
  }

  async markAllRead(userId: string) {
    await this.notifRepo
      .createQueryBuilder()
      .update()
      .set({ read_at: new Date() })
      .where('user_id = :userId AND read_at IS NULL', { userId })
      .execute();
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId, user_id: userId } });
    if (!notif) throw new NotFoundException('Notificación no encontrada');
    await this.notifRepo.delete(notificationId);
    return { message: 'Notificación eliminada' };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async persistNotification(userId: string, payload: PushPayload): Promise<void> {
    await this.notifRepo.save(
      this.notifRepo.create({
        user_id: userId,
        title: payload.title,
        body: payload.body,
        type: payload.type ?? NotificationType.GENERAL,
        data: payload.data ?? null,
      }),
    );
  }

  private async sendToToken(token: string, payload: PushPayload): Promise<void> {
    try {
      await admin.messaging().send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err) {
      if (err.code === 'messaging/registration-token-not-registered') {
        await this.usersRepo
          .createQueryBuilder().update()
          .set({ fcm_token: null })
          .where('fcm_token = :token', { token })
          .execute();
      } else {
        this.logger.warn(`FCM send failed: ${err.message}`);
      }
    }
  }

  private async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

      const invalidTokens = tokens.filter((_, i) =>
        response.responses[i]?.error?.code === 'messaging/registration-token-not-registered',
      );
      if (invalidTokens.length > 0) {
        await this.usersRepo
          .createQueryBuilder().update()
          .set({ fcm_token: null })
          .where('fcm_token IN (:...tokens)', { tokens: invalidTokens })
          .execute();
      }
    } catch (err) {
      this.logger.warn(`FCM multicast failed: ${err.message}`);
    }
  }
}
