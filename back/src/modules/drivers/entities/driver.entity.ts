import { Entity, PrimaryGeneratedColumn, Column, Index, OneToOne, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

export enum DriverType {
  DRIVER = 'driver',
  OWNER_DRIVER = 'owner_driver',
}

export enum DriverOnlineStatus {
  OFFLINE = 'offline',
  ONLINE = 'online',
  BUSY = 'busy',
  LOOKING_FOR_WORK = 'looking_for_work', // driver available to take owner's vehicle for the day
}

export enum DriverApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('drivers')
@Index('IDX_drivers_approval_online', ['approval_status', 'online_status'])
@Index('IDX_drivers_online_status', ['online_status'])
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: DriverType })
  driver_type: DriverType;

  @Column({ type: 'enum', enum: DriverApprovalStatus, default: DriverApprovalStatus.PENDING })
  approval_status: DriverApprovalStatus;

  @Column({ nullable: true })
  rejection_reason: string;

  @Column()
  full_name: string;

  @Column({ nullable: true })
  license_number: string;

  @Column({ nullable: true })
  license_expiry: Date;

  @Column({ nullable: true })
  profile_photo_url: string;

  // Vehículo activo para la jornada actual (null = no está en jornada)
  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'active_vehicle_id' })
  active_vehicle: Vehicle | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  current_lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  current_lng: number;

  @Column({ type: 'enum', enum: DriverOnlineStatus, default: DriverOnlineStatus.OFFLINE })
  online_status: DriverOnlineStatus;

  @Column({ nullable: true })
  last_seen_at: Date;

  // Momento en que se envió el push "¿sigues activo?" por inactividad.
  // null = no hay prompt pendiente. Se limpia al confirmar o al desconectar.
  @Column({ nullable: true })
  inactivity_prompt_sent_at: Date | null;

  @Column({ nullable: true })
  review_requested_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
