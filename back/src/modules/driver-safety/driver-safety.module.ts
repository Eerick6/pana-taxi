import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';
import { TripSafetyCheck } from './entities/trip-safety-check.entity';
import { TripDeviationAlert } from './entities/trip-deviation-alert.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User } from '../users/entities/user.entity';
import { StorageModule } from '../storage/storage.module';
import { FareModule } from '../fare/fare.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TripSafetyCheck, TripDeviationAlert, Trip, Driver, User]),
    StorageModule,
    FareModule,
    GatewayModule,
  ],
  providers: [DriverSafetyService],
  controllers: [DriverSafetyController],
})
export class DriverSafetyModule {}
