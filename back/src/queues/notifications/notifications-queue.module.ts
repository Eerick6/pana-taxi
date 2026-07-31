import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NOTIFICATION_QUEUE } from './notification-queue.types';
import { NotificationProcessor } from './notification.processor';
import { User } from '../../modules/users/entities/user.entity';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [NotificationProcessor],
  exports: [BullModule],
})
export class NotificationsQueueModule {}
