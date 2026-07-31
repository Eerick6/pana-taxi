import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { VehicleRequest } from './vehicle-request.entity';
import { Driver } from '../../drivers/entities/driver.entity';

export enum ApplicationStatus {
  PENDING = 'pending',   // driver se postuló, esperando respuesta del dueño
  ACCEPTED = 'accepted', // dueño aceptó esta postulación
  REJECTED = 'rejected', // dueño rechazó
  WITHDRAWN = 'withdrawn', // driver retiró su postulación
}

@Entity('vehicle_request_applications')
export class VehicleRequestApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VehicleRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: VehicleRequest;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ type: 'enum', enum: ApplicationStatus, default: ApplicationStatus.PENDING })
  status: ApplicationStatus;

  @Column({ type: 'text', nullable: true })
  message: string; // mensaje del driver al postularse

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
