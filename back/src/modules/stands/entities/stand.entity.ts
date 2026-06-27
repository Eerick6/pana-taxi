import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';

@Entity('stands')
export class Stand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lng: number;

  @ManyToOne(() => Cooperative)
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column()
  cooperative_id: string;

  @Column({ type: 'smallint', default: 10 })
  capacity: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
