import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../users/entities/user.entity';
import { AppNotification } from './entities/app-notification.entity';
import { NOTIFICATION_QUEUE } from '../../queues/notifications/notification-queue.types';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, AppNotification]),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
