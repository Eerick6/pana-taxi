import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { Driver } from './entities/driver.entity';
import { DriverDocument } from './entities/driver-document.entity';
import { User } from '../users/entities/user.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleDocument } from '../vehicles/entities/vehicle-document.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';
import { Trip } from '../trips/entities/trip.entity';
import { StorageModule } from '../storage/storage.module';
import { TermsModule } from '../terms/terms.module';
import { FareModule } from '../fare/fare.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverDocument, User, DriverWallet, Cooperative, CooperativeOwner, CooperativeMember, Vehicle, VehicleDocument, VehicleAssignment, Trip]),
    StorageModule,
    TermsModule,
    FareModule,
    GatewayModule,
    NotificationsModule,
  ],
  providers: [DriversService],
  controllers: [DriversController],
  exports: [DriversService, TypeOrmModule],
})
export class DriversModule {}
