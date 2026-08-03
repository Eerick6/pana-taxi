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
import { StorageModule } from '../storage/storage.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, VehicleAssignment, VehicleDocument, Driver, Cooperative, CooperativeOwner]),
    StorageModule,
    GatewayModule,
  ],
  providers: [VehiclesService],
  controllers: [VehiclesController],
  exports: [TypeOrmModule],
})
export class VehiclesModule {}
