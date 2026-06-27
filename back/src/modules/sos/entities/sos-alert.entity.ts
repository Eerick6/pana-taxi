import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SosStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
}

@Entity('sos_alerts')
export class SosAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @Column({ nullable: true })
  trip_id: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  lng: number | null;

  @Column({ nullable: true, length: 500 })
  message: string | null;

  @Column({ type: 'enum', enum: SosStatus, default: SosStatus.ACTIVE })
  status: SosStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by_id' })
  resolved_by: User | null;

  @Column({ nullable: true })
  resolved_by_id: string | null;

  @Column({ nullable: true })
  resolved_at: Date | null;

  @Column({ nullable: true, length: 500 })
  resolution_notes: string | null;

  @CreateDateColumn()
  triggered_at: Date;
}
