import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';
import { User } from '../../users/entities/user.entity';

export enum SettlementStatus {
  PENDING   = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Entity('cooperative_settlements')
@Index(['cooperative_id', 'status'])
export class CooperativeSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cooperative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column()
  cooperative_id: string;

  // Período que cubre la liquidación
  @Column({ type: 'date' })
  period_from: Date;

  @Column({ type: 'date' })
  period_to: Date;

  // Monto total de comisiones en el período
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gross_amount: string;

  // Porción que se lleva la plataforma
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  platform_fee: string;

  // Monto neto que debe recibir la cooperativa
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  net_amount: string;

  @Column({ type: 'enum', enum: SettlementStatus, default: SettlementStatus.PENDING })
  status: SettlementStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User | null;

  @Column({ nullable: true })
  created_by_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmed_by_id' })
  confirmed_by: User | null;

  @Column({ nullable: true })
  confirmed_by_id: string | null;

  @Column({ nullable: true })
  confirmed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
