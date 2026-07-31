import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { EventsGateway } from './events.gateway';
import { User } from '../users/entities/user.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Trip } from '../trips/entities/trip.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { FareModule } from '../fare/fare.module';
import { TRIP_EXPANSION_QUEUE } from '../../queues/trips/trip-expansion.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Driver, Trip, CooperativeOwner, CooperativeMember, Vehicle, Conversation]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    FareModule,
    // Register the queue so the gateway can enqueue expansion jobs.
    // RedisModule is @Global so REDIS_CLIENT is already available.
    BullModule.registerQueue({ name: TRIP_EXPANSION_QUEUE }),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class GatewayModule {}
