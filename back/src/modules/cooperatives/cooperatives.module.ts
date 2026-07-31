import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CooperativesService } from './cooperatives.service';
import { CooperativesController } from './cooperatives.controller';
import { CooperativesPublicController } from './cooperatives-public.controller';
import { Cooperative } from './entities/cooperative.entity';
import { CooperativeMember } from './entities/cooperative-member.entity';
import { CooperativeDocument } from './entities/cooperative-document.entity';
import { CooperativeOwner } from './entities/cooperative-owner.entity';
import { User } from '../users/entities/user.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Trip } from '../trips/entities/trip.entity';
import { StorageModule } from '../storage/storage.module';
import { TermsModule } from '../terms/terms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cooperative, CooperativeMember, CooperativeDocument, CooperativeOwner, User, Driver, Trip]),
    StorageModule,
    TermsModule,
  ],
  providers: [CooperativesService],
  controllers: [CooperativesController, CooperativesPublicController],
  exports: [TypeOrmModule],
})
export class CooperativesModule {}
