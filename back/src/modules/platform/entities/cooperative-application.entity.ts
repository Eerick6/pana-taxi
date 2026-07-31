import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum CoopApplicationStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('cooperative_applications')
export class CooperativeApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  cooperative_name: string;

  @Column({ unique: true })
  ruc: string;

  @Column()
  representative_name: string;

  @Column()
  representative_email: string;

  @Column()
  representative_phone: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  driver_count: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: CoopApplicationStatus, default: CoopApplicationStatus.PENDING })
  status: CoopApplicationStatus;

  @CreateDateColumn()
  created_at: Date;
}
