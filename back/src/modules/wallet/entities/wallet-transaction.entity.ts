import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { DriverWallet } from './driver-wallet.entity';

export enum TransactionType {
  RECHARGE = 'recharge',
  COMMISSION_DEDUCTION = 'commission_deduction',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  // Estas dos mueven wallet.card_balance (lo que la plataforma le debe al
  // conductor por tarjeta), no wallet.balance — balance_before/after abajo
  // reflejan card_balance para estos dos tipos.
  CARD_EARNING = 'card_earning',
  CARD_PAYOUT = 'card_payout',
}

@Entity('wallet_transactions')
@Index('IDX_wallet_transactions_wallet_created', ['wallet', 'created_at'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DriverWallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: DriverWallet;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_before: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_after: string;

  @Column({ nullable: true })
  reference_id: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
