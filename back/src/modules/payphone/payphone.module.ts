import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PayphoneService } from './payphone.service';
import { PayphoneController } from './payphone.controller';
import { Trip } from '../trips/entities/trip.entity';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Trip]),
    GatewayModule,
  ],
  providers: [PayphoneService],
  controllers: [PayphoneController],
})
export class PayphoneModule {}
