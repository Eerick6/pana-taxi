import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { VehicleRequest } from '../../vehicle-requests/entities/vehicle-request.entity';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';

export enum ConversationType {
  DRIVER_CLIENT   = 'driver_client',   // taxista ↔ pasajero (ligada a un viaje)
  DRIVER_OWNER    = 'driver_owner',    // conductor asignado ↔ dueño del taxi
  DRIVER_OPERATOR = 'driver_operator', // taxista ↔ operadora de su cooperativa
}

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ConversationType })
  type: ConversationType;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'participant_a_id' })
  participant_a: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'participant_b_id' })
  participant_b: User;

  // Contexto según el tipo de conversación
  @ManyToOne(() => Trip, { nullable: true })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip | null;

  @ManyToOne(() => VehicleRequest, { nullable: true })
  @JoinColumn({ name: 'vehicle_request_id' })
  vehicle_request: VehicleRequest | null;

  @ManyToOne(() => Cooperative, { nullable: true })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative | null;

  // Fecha del último mensaje (para ordenar conversaciones)
  @Column({ nullable: true })
  last_message_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
