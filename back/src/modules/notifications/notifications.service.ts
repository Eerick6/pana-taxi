import { Injectable, Logger, OnModuleInit, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { Server } from 'socket.io';
import { User } from '../users/entities/user.entity';
import { AppNotification, NotificationType } from './entities/app-notification.entity';
import { NOTIFICATION_QUEUE } from '../../queues/notifications/notification-queue.types';

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
  private wsServer: Server | null = null;

  /** Llamado por EventsGateway.afterInit() para emitir notifs en tiempo real */
  setWsServer(server: Server) {
    this.wsServer = server;
  }

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(AppNotification)
    private notifRepo: Repository<AppNotification>,
    @Optional() @InjectQueue(NOTIFICATION_QUEUE) private notificationQueue: Queue | null,
  ) {}

  onModuleInit() {
    try {
      let serviceAccount: object | null = null;

      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        try {
          serviceAccount = JSON.parse(raw);
        } catch {
          // Railway puede almacenar \n como saltos de línea reales — re-escapar
          serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
        }
      } else if (process.env.FCM_SERVICE_ACCOUNT_PATH) {
        const raw = fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_PATH, 'utf8');
        serviceAccount = JSON.parse(raw);
      }

      if (!serviceAccount) {
        this.logger.warn('Firebase no configurado — push notifications deshabilitadas');
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount as admin.ServiceAccount) });
      }
      this.initialized = true;
      this.logger.log('Firebase Admin SDK inicializado correctamente');
    } catch (err) {
      this.logger.error(`Error inicializando Firebase Admin: ${err.message}`);
    }
  }

  async registerToken(userId: string, token: string) {
    this.logger.log(`[FCM-REG] userId=${userId} token=${token.slice(0, 20)}…`);
    await this.usersRepo.update(userId, { fcm_token: token });
    this.logger.log(`[FCM-REG] token guardado OK`);
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

    if (this.notificationQueue) {
      // Async via Bull queue — non-blocking, with retry
      this.notificationQueue
        .add(
          'fcm',
          { type: 'fcm', userId, title: payload.title, body: payload.body, data: payload.data },
          { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
        )
        .catch(err => {
          this.logger.warn(`Queue unavailable, sending FCM directly: ${err.message}`);
          this.usersRepo
            .findOne({ where: { id: userId }, select: ['fcm_token'] })
            .then(user => { if (user?.fcm_token) this.sendToToken(user.fcm_token, payload); })
            .catch(() => {});
        });
    } else {
      // Fallback: direct send when queue is not available
      const user = await this.usersRepo.findOne({ where: { id: userId }, select: ['fcm_token'] });
      if (user?.fcm_token) await this.sendToToken(user.fcm_token, payload);
    }
  }

  // Envía push + persiste para VARIOS usuarios
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return;

    // Persist to notification feed for all
    userIds.forEach(uid => this.persistNotification(uid, payload).catch(() => {}));

    if (!this.initialized) return;

    if (this.notificationQueue) {
      // One job per user — each handles its own token lookup + retry
      const jobs = userIds.map(uid => ({
        name: 'fcm',
        data: { type: 'fcm' as const, userId: uid, title: payload.title, body: payload.body, data: payload.data },
        opts: { attempts: 3, backoff: { type: 'exponential' as const, delay: 1000 } },
      }));
      this.notificationQueue.addBulk(jobs).catch(err => {
        this.logger.warn(`Queue unavailable, sending FCM directly: ${err.message}`);
        this.usersRepo
          .find({ where: { id: In(userIds) }, select: ['fcm_token'] })
          .then(users => {
            const tokens = users.map(u => u.fcm_token).filter(Boolean) as string[];
            if (tokens.length > 0) this.sendToTokens(tokens, payload).catch(() => {});
          })
          .catch(() => {});
      });
    } else {
      // Fallback: direct send
      const users = await this.usersRepo.find({ where: { id: In(userIds) }, select: ['fcm_token'] });
      const tokens = users.map(u => u.fcm_token).filter(Boolean) as string[];
      if (tokens.length > 0) await this.sendToTokens(tokens, payload);
    }
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
    const notif = await this.notifRepo.save(
      this.notifRepo.create({
        user_id: userId,
        title: payload.title,
        body: payload.body,
        type: payload.type ?? NotificationType.GENERAL,
        data: payload.data ?? null,
      }),
    );
    // Emitir en tiempo real al usuario (panel web o móvil con socket activo)
    this.wsServer?.to(`user:${userId}`).emit('notification.new', {
      id: notif.id,
      title: notif.title,
      body: notif.body,
      type: notif.type,
      data: notif.data,
      created_at: notif.created_at,
    });
  }

  private async sendToToken(token: string, payload: PushPayload): Promise<void> {
    const isTripAlert = payload.data?.['type'] === 'trip_new' || payload.data?.['type'] === 'price_updated';
    const msg = isTripAlert
      ? {
          data: { ...payload.data ?? {}, title: payload.title, body: payload.body },
          android: { priority: 'high' as const },
          apns: { payload: { aps: { contentAvailable: true, sound: 'trip_alert.wav', badge: 1 } } },
        }
      : {
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: { priority: 'high' as const, notification: { channelId: 'default', defaultSound: true } },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        };
    try {
      this.logger.log(`[FCM] sending to token ${token.slice(0, 20)}… type=${payload.data?.['type'] ?? 'general'}`);
      await admin.messaging().send({ token, ...msg });
      this.logger.log(`[FCM] sent OK`);
    } catch (err) {
      if (err.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`[FCM] invalid token — clearing`);
        await this.usersRepo
          .createQueryBuilder().update()
          .set({ fcm_token: null })
          .where('fcm_token = :token', { token })
          .execute();
      } else {
        this.logger.warn(`[FCM] send failed: ${err.message}`);
      }
    }
  }

  private async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    const isTripAlert = payload.data?.['type'] === 'trip_new' || payload.data?.['type'] === 'price_updated';
    const msg = isTripAlert
      ? {
          data: { ...payload.data ?? {}, title: payload.title, body: payload.body },
          android: { priority: 'high' as const },
          apns: { payload: { aps: { contentAvailable: true, sound: 'trip_alert.wav', badge: 1 } } },
        }
      : {
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: { priority: 'high' as const, notification: { channelId: 'default', defaultSound: true } },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        };
    try {
      const response = await admin.messaging().sendEachForMulticast({ tokens, ...msg });

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
