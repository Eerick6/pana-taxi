import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DriverWallet } from './driver-wallet.entity';
import { User } from '../../users/entities/user.entity';
import { BankAccount } from './bank-account.entity';

export enum RechargeMethod {
  BANK_TRANSFER = 'bank_transfer',
}

export enum RechargeStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
}

@Entity('recharges')
export class Recharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DriverWallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: DriverWallet;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: RechargeMethod, default: RechargeMethod.BANK_TRANSFER })
  method: RechargeMethod;

  @Column({ type: 'enum', enum: RechargeStatus, default: RechargeStatus.PENDING })
  status: RechargeStatus;

  @Column({ nullable: true })
  proof_url: string;

  @ManyToOne(() => BankAccount, { nullable: true, eager: false })
  @JoinColumn({ name: 'bank_account_id' })
  bank_account: BankAccount;

  @Column({ nullable: true })
  driver_notes: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmed_by' })
  confirmed_by: User;

  @Column({ nullable: true })
  confirmed_at: Date;

  @Column({ nullable: true })
  rejection_reason: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
