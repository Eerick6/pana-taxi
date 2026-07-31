import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from './driver.entity';

export enum DriverDocumentType {
  CEDULA_FRONT = 'cedula_front',           // Cédula lado frontal
  CEDULA_BACK = 'cedula_back',             // Cédula lado posterior
  LICENSE_FRONT = 'license_front',         // Licencia lado frontal
  LICENSE_BACK = 'license_back',           // Licencia lado posterior
  BACKGROUND_CHECK = 'background_check',   // Record policial — 15 días de gracia
  PROFILE_PHOTO = 'profile_photo',
}

// Documentos obligatorios para aprobar al conductor (cédula + licencia)
export const REQUIRED_DOCS = [
  DriverDocumentType.CEDULA_FRONT,
  DriverDocumentType.CEDULA_BACK,
  DriverDocumentType.LICENSE_FRONT,
  DriverDocumentType.LICENSE_BACK,
];

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ type: 'enum', enum: DriverDocumentType })
  type: DriverDocumentType;

  @Column()
  file_url: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status: DocumentStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @Column({ nullable: true })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
