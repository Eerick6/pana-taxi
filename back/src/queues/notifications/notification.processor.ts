import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as admin from 'firebase-admin';
import { Twilio } from 'twilio';
import { NOTIFICATION_QUEUE, NotificationJobData, FcmJobData, SmsJobData } from './notification-queue.types';
import { User } from '../../modules/users/entities/user.entity';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  private twilio: Twilio | null = null;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {
    super();
    if (process.env.TWILIO_ACCOUNT_SID) {
      this.twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const data = job.data;
    if (data.type === 'fcm') {
      await this.handleFcm(data as FcmJobData);
    } else if (data.type === 'sms') {
      await this.handleSms(data as SmsJobData);
    } else {
      this.logger.warn(`Unknown notification job type: ${(data as any).type}`);
    }
  }

  private async handleFcm(data: FcmJobData): Promise<void> {
    if (!admin.apps.length) {
      this.logger.warn('Firebase Admin SDK not initialized — skipping FCM job');
      return;
    }

    let tokens: string[] = [];
    if (data.tokens && data.tokens.length > 0) {
      tokens = data.tokens;
    } else if (data.userId) {
      const user = await this.usersRepo.findOne({ where: { id: data.userId }, select: ['fcm_token'] });
      if (user?.fcm_token) tokens = [user.fcm_token];
    }

    this.logger.log(`[FCM-JOB] userId=${data.userId} tokens found: ${tokens.length} | DB token: ${tokens[0]?.slice(0, 20) ?? 'NULL'}`);
    if (tokens.length === 0) {
      this.logger.debug(`FCM job for user ${data.userId ?? 'unknown'}: no FCM tokens found`);
      return;
    }

    const isTripAlert = data.data?.['type'] === 'trip_new';
    // Trip alerts: data-only (no notification field) + high priority → Android always
    // delivers to onBackgroundMessage even in Doze mode, never intercepted by the OS.
    // Other messages: normal notification message.
    const androidNotif = isTripAlert
      ? { priority: 'high' as const }
      : { priority: 'high' as const };
    const apns = isTripAlert
      ? { payload: { aps: { contentAvailable: true, sound: 'trip_alert.wav', badge: 1 } } }
      : { payload: { aps: { sound: 'default', badge: 1 } } };
    const base = isTripAlert
      ? {
          data: { ...data.data ?? {}, title: data.title, body: data.body },
          android: androidNotif,
          apns,
        }
      : {
          notification: { title: data.title, body: data.body },
          data: data.data ?? {},
          android: androidNotif,
          apns,
        };

    try {
      if (tokens.length === 1) {
        await admin.messaging().send({ ...base, token: tokens[0] });
      } else {
        const response = await admin.messaging().sendEachForMulticast({ ...base, tokens });
        const invalidTokens = tokens.filter(
          (_, i) => response.responses[i]?.error?.code === 'messaging/registration-token-not-registered',
        );
        if (invalidTokens.length > 0) {
          await this.usersRepo.createQueryBuilder().update().set({ fcm_token: null })
            .where('fcm_token IN (:...tokens)', { tokens: invalidTokens }).execute();
        }
      }
    } catch (err) {
      if (err.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`[FCM-JOB] token inválido — limpiando: ${tokens.join(',').slice(0, 40)}`);
        await this.usersRepo.createQueryBuilder().update().set({ fcm_token: null })
          .where('fcm_token IN (:...tokens)', { tokens }).execute();
      } else {
        this.logger.warn(`FCM send failed: ${err.message}`);
        throw err;
      }
    }
  }

  private async handleSms(data: SmsJobData): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV SMS] → ${data.to}: ${data.message}`);
      return;
    }
    if (!this.twilio) {
      this.logger.warn('Twilio not configured — skipping SMS job');
      return;
    }
    await this.twilio.messages.create({ body: data.message, from: process.env.TWILIO_PHONE, to: data.to });
  }
}
