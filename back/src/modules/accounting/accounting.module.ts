import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { CooperativeAccount } from './entities/cooperative-account.entity';
import { CoopAccountTx } from './entities/coop-account-tx.entity';
import { CooperativeSettlement } from './entities/cooperative-settlement.entity';
import { SystemConfig } from '../platform/entities/system-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CooperativeAccount, CoopAccountTx, CooperativeSettlement, SystemConfig])],
  providers: [AccountingService],
  controllers: [AccountingController],
  exports: [AccountingService],
})
export class AccountingModule {}
