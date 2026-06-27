import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Stand } from './stand.entity';
import { Driver } from '../../drivers/entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Entity('stand_assignments')
export class StandAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Stand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stand_id' })
  stand: Stand;

  @Column()
  stand_id: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column()
  driver_id: string;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  @Column({ nullable: true })
  vehicle_id: string | null;

  @CreateDateColumn()
  checked_in_at: Date;

  @Column({ nullable: true })
  checked_out_at: Date | null;
}
