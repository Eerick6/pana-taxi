import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';

export enum PaymentMethod {
  TRANSFER = 'transfer',
  CARD = 'card',
  CASH = 'cash',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('billing_payments')
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Invoice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ nullable: true })
  invoice_id: string;

  @ManyToOne(() => Cooperative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column({ nullable: true })
  cooperative_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ nullable: true })
  reference: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'date', nullable: true })
  paid_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
