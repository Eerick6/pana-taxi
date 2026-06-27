import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cooperative } from './cooperative.entity';
import { Driver } from '../../drivers/entities/driver.entity';

export enum OwnerApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('cooperative_owners')
export class CooperativeOwner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cooperative)
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'owner_id' })
  owner: Driver;

  @Column({ type: 'enum', enum: OwnerApprovalStatus, default: OwnerApprovalStatus.PENDING })
  approval_status: OwnerApprovalStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
