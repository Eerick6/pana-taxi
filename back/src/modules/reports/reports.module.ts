import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Trip } from '../trips/entities/trip.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, DriverWallet, CooperativeMember])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
