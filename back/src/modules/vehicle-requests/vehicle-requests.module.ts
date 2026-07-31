import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleRequestsService } from './vehicle-requests.service';
import { VehicleRequestsController } from './vehicle-requests.controller';
import { VehicleRequest } from './entities/vehicle-request.entity';
import { VehicleRequestApplication } from './entities/vehicle-request-application.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';
import { FareModule } from '../fare/fare.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleRequest, VehicleRequestApplication, Driver, Vehicle, VehicleAssignment]),
    FareModule,
    GatewayModule,
  ],
  providers: [VehicleRequestsService],
  controllers: [VehicleRequestsController],
})
export class VehicleRequestsModule {}
