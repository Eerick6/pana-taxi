import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

export enum VehicleRequestStatus {
  OPEN = 'open',         // owner posted, waiting for a driver
  ACCEPTED = 'accepted', // a driver claimed it
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

  // The owner_driver who posted the request
  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'owner_id' })
  owner: Driver;

  // The regular driver who accepted
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'accepted_by' })
  accepted_by: Driver;

  @Column({ type: 'enum', enum: VehicleRequestStatus, default: VehicleRequestStatus.OPEN })
  status: VehicleRequestStatus;

  @Column({ nullable: true })
  notes: string;

  // When they need the driver (optional, can be ASAP)
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
