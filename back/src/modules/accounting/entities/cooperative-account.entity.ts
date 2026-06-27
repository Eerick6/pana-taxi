import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';

@Entity('cooperative_accounts')
export class CooperativeAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Cooperative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Index()
  @Column()
  cooperative_id: string;

  // Total acumulado de comisiones cobradas a conductores (bruto)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  gross_balance: string;

  // Porción que pertenece a la plataforma (se liquida periodicamente)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  platform_due: string;

  // Saldo neto de la cooperativa (gross - platform_due - liquidaciones)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  net_balance: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
