import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cooperative } from './cooperative.entity';

export enum CooperativeDocumentType {
  RUC = 'ruc',
  SEPS_RESOLUTION = 'seps_resolution',                     // Resolución SEPS de constitución legal
  STATUTES = 'statutes',                                   // Estatutos aprobados por SEPS
  ANT_PERMIT = 'ant_permit',                               // Permiso de operación ANT/GADM
  REPRESENTATIVE_ID = 'representative_id',                 // Cédula del representante legal
  REPRESENTATIVE_APPOINTMENT = 'representative_appointment', // Nombramiento del representante legal
  OTHER = 'other',
}

export enum CooperativeDocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('cooperative_documents')
export class CooperativeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cooperative)
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @Column({ type: 'enum', enum: CooperativeDocumentType })
  type: CooperativeDocumentType;

  @Column()
  file_url: string;

  @Column({ type: 'enum', enum: CooperativeDocumentStatus, default: CooperativeDocumentStatus.PENDING })
  status: CooperativeDocumentStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
