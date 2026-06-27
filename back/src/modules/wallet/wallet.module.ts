import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { DriverWallet } from './entities/driver-wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Recharge } from './entities/recharge.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverWallet, WalletTransaction, Recharge, Driver]),
    StorageModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
