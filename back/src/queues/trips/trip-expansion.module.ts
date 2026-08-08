import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TRIP_EXPANSION_QUEUE } from './trip-expansion.processor';
import { TripExpansionProcessor } from './trip-expansion.processor';
import { Trip } from '../../modules/trips/entities/trip.entity';
import { FareModule } from '../../modules/fare/fare.module';
import { GatewayModule } from '../../modules/gateway/gateway.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: TRIP_EXPANSION_QUEUE,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 50 },
    }),
    TypeOrmModule.forFeature([Trip]),
    FareModule,
    GatewayModule,
  ],
  providers: [TripExpansionProcessor],
  exports: [BullModule],
})
export class TripExpansionModule {}
