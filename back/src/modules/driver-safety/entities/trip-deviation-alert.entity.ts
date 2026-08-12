import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { Driver } from '../../drivers/entities/driver.entity';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';
import { User } from '../../users/entities/user.entity';

export enum DeviationAlertStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

// Alerta persistente cuando un conductor lleva sostenidamente lejos de la ruta
// planeada (seguridad del taxista) — distinto del re-ruteo en vivo (que ocurre
// en cada ping y solo actualiza la ruta, sin generar una alerta accionable).
@Entity('trip_deviation_alerts')
@Index('IDX_trip_deviation_alerts_status', ['status'])
export class TripDeviationAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column()
  trip_id: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column()
  driver_id: string;

  @ManyToOne(() => Cooperative, { nullable: true })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative | null;

  @Column({ nullable: true })
  cooperative_id: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  lng: number;

  @Column({ type: 'enum', enum: DeviationAlertStatus, default: DeviationAlertStatus.OPEN })
  status: DeviationAlertStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by_id' })
  resolved_by: User | null;

  @Column({ nullable: true })
  resolved_by_id: string | null;

  @Column({ nullable: true })
  resolved_at: Date | null;

  @Column({ nullable: true, length: 500 })
  resolution_notes: string | null;

  @CreateDateColumn()
  triggered_at: Date;
}
