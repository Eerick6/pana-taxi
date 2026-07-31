import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Trip } from '../trips/entities/trip.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Cooperative } from '../cooperatives/entities/cooperative.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Trip, DriverWallet, CooperativeMember,
    Cooperative, Vehicle, Driver, Client, WalletTransaction,
  ])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
