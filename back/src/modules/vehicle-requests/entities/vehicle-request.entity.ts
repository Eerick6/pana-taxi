import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

export enum VehicleRequestStatus {
  OPEN = 'open',           // publicado, esperando postulantes
  ACCEPTED = 'accepted',   // dueño aceptó a un conductor
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('vehicle_requests')
export class VehicleRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'owner_id' })
  owner: Driver;

  // Conductor que el dueño aceptó (se llena cuando el dueño elige una postulación)
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'accepted_driver_id' })
  accepted_driver: Driver | null;

  @Column({ type: 'enum', enum: VehicleRequestStatus, default: VehicleRequestStatus.OPEN })
  status: VehicleRequestStatus;

  @Column({ nullable: true })
  notes: string;

  // Posición del taxi al publicar — para mostrar solo a conductores cercanos
  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  lng: number;

  // Radio de búsqueda activo (crece automáticamente si nadie se postula)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '5.00' })
  search_radius_km: number;

  // Timestamp del último crecimiento del radio
  @Column({ nullable: true })
  radius_expanded_at: Date;

  @Column({ nullable: true })
  needed_from: Date;

  @Column({ nullable: true })
  needed_until: Date;

  @Column({ nullable: true })
  accepted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
