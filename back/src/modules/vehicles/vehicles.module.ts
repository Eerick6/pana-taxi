import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleAssignment } from './entities/vehicle-assignment.entity';
import { VehicleDocument } from './entities/vehicle-document.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { StorageModule } from '../storage/storage.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, VehicleAssignment, VehicleDocument, Driver, Cooperative, CooperativeOwner, CooperativeMember]),
    StorageModule,
    GatewayModule,
    NotificationsModule,
  ],
  providers: [VehiclesService],
  controllers: [VehiclesController],
  exports: [TypeOrmModule],
})
export class VehiclesModule {}
