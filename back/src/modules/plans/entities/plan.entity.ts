import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price_monthly: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_yearly: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commission_pct: number;

  @Column({ type: 'int', nullable: true })
  max_drivers: number;

  @Column({ type: 'int', nullable: true })
  max_vehicles: number;

  @Column({ type: 'int', nullable: true })
  max_stands: number;

  @Column({ type: 'simple-json', nullable: true })
  features: string[];

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
