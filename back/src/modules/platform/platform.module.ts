import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PublicController } from './public.controller';
import { PlatformMember } from './entities/platform-member.entity';
import { SystemConfig } from './entities/system-config.entity';
import { CooperativeSubscription } from './entities/cooperative-subscription.entity';
import { ContactLead } from './entities/contact-lead.entity';
import { CooperativeApplication } from './entities/cooperative-application.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformMember, SystemConfig, CooperativeSubscription, ContactLead, CooperativeApplication, Cooperative, User])],
  providers: [PlatformService],
  controllers: [PlatformController, PublicController],
  exports: [TypeOrmModule],
})
export class PlatformModule {}
