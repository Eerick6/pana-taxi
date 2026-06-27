import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CooperativeStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum CooperativeApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('cooperatives')
export class Cooperative {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  ruc: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ type: 'enum', enum: CooperativeStatus, default: CooperativeStatus.INACTIVE })
  status: CooperativeStatus;

  @Column({ type: 'enum', enum: CooperativeApprovalStatus, default: CooperativeApprovalStatus.PENDING })
  approval_status: CooperativeApprovalStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commission_override: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthly_fee_override: number;

  @Column({ nullable: true })
  terms_version: string;

  @Column({ nullable: true })
  terms_accepted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
