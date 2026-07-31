import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { PlatformMember } from '../platform/entities/platform-member.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { TermsModule } from '../terms/terms.module';
import { NOTIFICATION_QUEUE } from '../../queues/notifications/notification-queue.types';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN as any },
      }),
    }),
    TypeOrmModule.forFeature([User, Client, PlatformMember, CooperativeMember]),
    TermsModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtGuard, RolesGuard],
  exports: [JwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
