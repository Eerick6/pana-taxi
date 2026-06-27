import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Check } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';
import { Client } from '../../clients/entities/client.entity';

export enum RatingDirection {
  CLIENT_TO_DRIVER = 'client_to_driver',   // client rates driver after trip
  DRIVER_TO_CLIENT = 'driver_to_client',   // driver rates client after trip
  OWNER_TO_DRIVER  = 'owner_to_driver',    // owner rates hired driver after vehicle_request
  DRIVER_TO_OWNER  = 'driver_to_owner',    // hired driver rates the owner after vehicle_request
}

@Entity('ratings')
@Check(`"score" BETWEEN 1 AND 5`)
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RatingDirection })
  direction: RatingDirection;

  // Reference to trip (for trip-based ratings) — FK enforced when trips module exists
  @Column({ nullable: true })
  trip_id: string;

  // Reference to vehicle_request (for owner→driver ratings)
  @Column({ nullable: true })
  vehicle_request_id: string;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  // The owner who is rating (stored as driver since owners are OWNER_DRIVER type)
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: Driver;

  @Column({ type: 'tinyint' })
  score: number; // 1–5 stars

  @Column({ nullable: true, length: 500 })
  comment: string;

  @CreateDateColumn()
  created_at: Date;
}
