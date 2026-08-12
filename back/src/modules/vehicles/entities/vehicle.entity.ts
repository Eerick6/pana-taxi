import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';
import { Driver } from '../../drivers/entities/driver.entity';



export enum VehicleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum VehicleApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('vehicles')
@Index('IDX_vehicles_coop_approval', ['cooperative', 'approval_status'])
@Index('IDX_vehicles_owner', ['owner'])
@Index('IDX_vehicles_assigned_driver', ['assigned_driver'])
@Index('IDX_vehicles_status', ['status'])
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cooperative)
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'owner_id' })
  owner: Driver;

  // Regular DRIVER assigned by the owner to drive this vehicle
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'assigned_driver_id' })
  assigned_driver: Driver | null;

  @Column({ unique: true })
  plate: string;

  @Column()
  brand: string;

  @Column()
  model: string;

  @Column()
  color: string;

  @Column()
  year: number;

  @Column({ nullable: true })
  photo_url: string;

  @Column({ type: 'enum', enum: VehicleStatus, default: VehicleStatus.INACTIVE })
  status: VehicleStatus;

  @Column({ type: 'enum', enum: VehicleApprovalStatus, default: VehicleApprovalStatus.PENDING })
  approval_status: VehicleApprovalStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
