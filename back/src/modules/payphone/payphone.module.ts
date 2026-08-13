import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PayphoneService } from './payphone.service';
import { PayphoneController } from './payphone.controller';
import { Trip } from '../trips/entities/trip.entity';
import { Client } from '../clients/entities/client.entity';
import { GatewayModule } from '../gateway/gateway.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Trip, Client]),
    GatewayModule,
    WalletModule,
    NotificationsModule,
  ],
  providers: [PayphoneService],
  controllers: [PayphoneController],
})
export class PayphoneModule {}
