import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, Index,
} from 'typeorm';
import { CooperativeAccount } from './cooperative-account.entity';

export enum CoopTxType {
  COMMISSION_CREDIT = 'commission_credit',   // Comisión recibida de un conductor
  PLATFORM_DEBIT    = 'platform_debit',      // Deducción de porción plataforma
  SETTLEMENT_DEBIT  = 'settlement_debit',    // Liquidación a la cooperativa
  ADJUSTMENT        = 'adjustment',          // Ajuste manual
}

@Entity('coop_account_txs')
@Index(['account_id', 'created_at'])
export class CoopAccountTx {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CooperativeAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: CooperativeAccount;

  @Column()
  account_id: string;

  @Column({ type: 'enum', enum: CoopTxType })
  type: CoopTxType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gross_before: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gross_after: string;

  @Column({ nullable: true })
  reference_id: string | null;   // trip_id, settlement_id, etc.

  @Column({ nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
