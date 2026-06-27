import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { Driver } from '../../drivers/entities/driver.entity';
import { User } from '../../users/entities/user.entity';

export enum AssignmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('vehicle_assignments')
export class VehicleAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by' })
  assigned_by: User;

  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.ACTIVE })
  status: AssignmentStatus;

  @Column()
  assigned_at: Date;

  @Column({ nullable: true })
  unassigned_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
