import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { User } from '../users/entities/user.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Trip } from '../trips/entities/trip.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { FareModule } from '../fare/fare.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Driver, Trip, CooperativeOwner, CooperativeMember, Vehicle]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    FareModule,
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class GatewayModule {}
