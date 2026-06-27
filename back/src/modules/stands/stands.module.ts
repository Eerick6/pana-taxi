import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandsService } from './stands.service';
import { StandsController } from './stands.controller';
import { Stand } from './entities/stand.entity';
import { StandAssignment } from './entities/stand-assignment.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stand, StandAssignment, Driver, CooperativeMember, CooperativeOwner]),
  ],
  providers: [StandsService],
  controllers: [StandsController],
  exports: [StandsService],
})
export class StandsModule {}
