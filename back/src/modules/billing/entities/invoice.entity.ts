import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';
import { Plan } from '../../plans/entities/plan.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

@Entity('billing_invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cooperative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column({ nullable: true })
  cooperative_id: string;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @Column({ nullable: true })
  plan_id: string;

  @Column({ type: 'date' })
  period_from: Date;

  @Column({ type: 'date' })
  period_to: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ type: 'date' })
  due_date: Date;

  @Column({ type: 'date', nullable: true })
  paid_at: Date;

  @Column({ nullable: true })
  pdf_url: string;

  @CreateDateColumn()
  created_at: Date;
}
