import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum LeadStatus {
  NEW = 'new',
  READ = 'read',
  ARCHIVED = 'archived',
}

@Entity('contact_leads')
export class ContactLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  cooperative: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  driver_count_range: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @CreateDateColumn()
  created_at: Date;
}
