import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Cooperative } from './cooperative.entity';

export enum CooperativeMemberRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  SUPERVISOR = 'supervisor',
}

@Entity('cooperative_members')
export class CooperativeMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Cooperative)
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column()
  full_name: string;

  @Column({ type: 'enum', enum: CooperativeMemberRole })
  role: CooperativeMemberRole;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
