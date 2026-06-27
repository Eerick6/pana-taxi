import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { DocumentStatus } from '../../drivers/entities/driver-document.entity';

export enum VehicleDocumentType {
  MATRICULA = 'matricula',
  SOAT = 'soat',
  TECHNICAL_REVIEW = 'technical_review',
  VEHICLE_PHOTO = 'vehicle_photo',
}

@Entity('vehicle_documents')
export class VehicleDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ type: 'enum', enum: VehicleDocumentType })
  type: VehicleDocumentType;

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
