import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { TripsScheduler } from './trips.scheduler';
import { Trip } from './entities/trip.entity';
import { TripOffer } from './entities/trip-offer.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { SystemConfig } from '../platform/entities/system-config.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { WalletModule } from '../wallet/wallet.module';
import { GatewayModule } from '../gateway/gateway.module';
import { FareModule } from '../fare/fare.module';
import { DriversModule } from '../drivers/drivers.module';
import { Stand } from '../stands/entities/stand.entity';
import { StandAssignment } from '../stands/entities/stand-assignment.entity';
import { Client } from '../clients/entities/client.entity';
import { PaymentMethod } from '../payment-methods/entities/payment-method.entity';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trip,
      TripOffer,
      Driver,
      Vehicle,
      VehicleAssignment,
      CooperativeOwner,
      CooperativeMember,
      SystemConfig,
      DriverWallet,
      Stand,
      StandAssignment,
      Client,
      PaymentMethod,
    ]),
    WalletModule,
    GatewayModule,
    FareModule,
    DriversModule,
    AccountingModule,
  ],
  providers: [TripsService, TripsScheduler],
  controllers: [TripsController],
  exports: [TripsService, TypeOrmModule],
})
export class TripsModule {}
