import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  TRIP = 'trip',
  ACCOUNT = 'account',
  WALLET = 'wallet',
  SOS = 'sos',
  GENERAL = 'general',
}

@Entity('app_notifications')
@Index(['user_id', 'read_at'])
export class AppNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.GENERAL })
  type: NotificationType;

  @Column({ type: 'json', nullable: true })
  data: Record<string, string> | null;

  @Column({ nullable: true })
  read_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
