import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformMember } from './entities/platform-member.entity';
import { SystemConfig } from './entities/system-config.entity';
import { CooperativeSubscription } from './entities/cooperative-subscription.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformMember, SystemConfig, CooperativeSubscription, Cooperative, User])],
  providers: [PlatformService],
  controllers: [PlatformController],
  exports: [TypeOrmModule],
})
export class PlatformModule {}
