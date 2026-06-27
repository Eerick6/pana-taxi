import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleRequestsService } from './vehicle-requests.service';
import { VehicleRequestsController } from './vehicle-requests.controller';
import { VehicleRequest } from './entities/vehicle-request.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleRequest, Driver, Vehicle, VehicleAssignment])],
  providers: [VehicleRequestsService],
  controllers: [VehicleRequestsController],
})
export class VehicleRequestsModule {}
