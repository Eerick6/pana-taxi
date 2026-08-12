import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Driver } from '../../drivers/entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { Cooperative } from '../../cooperatives/entities/cooperative.entity';
import { PaymentMethod } from '../../payment-methods/entities/payment-method.entity';
import { Stand } from '../../stands/entities/stand.entity';
import { TripOffer } from './trip-offer.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TripSource {
  CLIENT = 'client',
  COOPERATIVE = 'cooperative',
}

export enum TripStatus {
  REQUESTED = 'requested',
  NEGOTIATING = 'negotiating',  // legacy — mantenido para registros históricos
  ACCEPTED = 'accepted',
  DRIVER_ARRIVED = 'driver_arrived', // conductor llegó al punto de recogida
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum FareMode {
  METER = 'meter',          // taxímetro virtual
  NEGOTIATED = 'negotiated', // cliente propone, conductor acepta/contraoferta
}

export enum CancelledBy {
  CLIENT = 'client',
  DRIVER = 'driver',
  COOPERATIVE = 'cooperative',
  PLATFORM = 'platform',
}

@Entity('trips')
@Index('IDX_trips_coop_status', ['cooperative', 'status'])
@Index('IDX_trips_driver_status', ['driver', 'status'])
@Index('IDX_trips_client_status', ['client', 'status'])
@Index('IDX_trips_status', ['status'])
@Index('IDX_trips_created_at', ['created_at'])
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TripSource })
  source: TripSource;

  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.REQUESTED })
  status: TripStatus;

  @Column({ type: 'enum', enum: FareMode, default: FareMode.METER })
  fare_mode: FareMode;

  // Client who requested (null for cooperative walk-in trips)
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: User | null;

  // Cooperative that created the trip (null for client trips)
  @ManyToOne(() => Cooperative, { nullable: true })
  @JoinColumn({ name: 'cooperative_id' })
  cooperative: Cooperative | null;

  // Parada de origen — solo viajes cooperativos. CLIENT siempre usa su ubicación GPS.
  @ManyToOne(() => Stand, { nullable: true })
  @JoinColumn({ name: 'stand_id' })
  stand: Stand | null;

  @Column({ nullable: true })
  stand_id: string | null;

  @Column({ nullable: true })
  walk_in_client_name: string;

  // Assigned once a driver accepts
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver | null;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  // Origin
  @Column()
  origin_address: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  origin_lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  origin_lng: number;

  // Destination
  @Column()
  destination_address: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  destination_lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  destination_lng: number;

  // Ruta estimada por Google Maps (o Haversine como fallback)
  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true })
  estimated_distance_km: number;

  @Column({ type: 'smallint', nullable: true })
  estimated_duration_min: number;

  // Tarifa sugerida calculada al momento de crear el viaje
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  suggested_fare: number;

  // Regateo — solo aplica cuando fare_mode = 'negotiated'
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  client_offer: number;        // lo que ofrece pagar el cliente

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  driver_counter_offer: number; // contraoferta del conductor

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agreed_fare: number;          // precio pactado antes de arrancar

  // Ruta planificada pickup → destino (GeoJSON LineString de Mapbox)
  // El frontend la dibuja con Mapbox GL JS directamente
  @Column({ type: 'longtext', nullable: true })
  route_geometry: string;

  // Posición actual del cliente (se actualiza mientras espera al conductor)
  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  client_current_lat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  client_current_lng: number;

  // Seguimiento de desvío sostenido (seguridad del conductor) — distinto del
  // recorte de re-ruteo en vivo de events.gateway.ts. Se limpia al volver a ruta.
  @Column({ nullable: true })
  deviation_started_at: Date | null;

  @Column({ nullable: true })
  deviation_alert_sent_at: Date | null;

  // Radio de búsqueda activo para este viaje (crece si no hay conductor)
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  current_search_radius_km: number;

  @Column({ nullable: true })
  radius_last_expanded_at: Date;

  // Taxímetro virtual — acumula durante in_progress
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  meter_amount: number;

  // Método de pago seleccionado por el pasajero
  @ManyToOne(() => PaymentMethod, { nullable: true })
  @JoinColumn({ name: 'payment_method_id' })
  payment_method: PaymentMethod | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  payment_status: PaymentStatus;

  // Fare final y comisión — se fijan al COMPLETAR
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fare_amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: '0.1000' })
  commission_rate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  commission_amount: number;

  // OTP de inicio — generado al aceptar el viaje, visible solo para el cliente en la app
  // el conductor lo pide al pasajero para verificar identidad antes de arrancar
  @Column({ nullable: true, length: 6 })
  otp_code: string | null;

  // Timestamps por estado
  @Column({ nullable: true })
  accepted_at: Date;

  @Column({ nullable: true })
  driver_arrived_at: Date;

  @Column({ nullable: true })
  wait_timer_expires_at: Date;

  @Column({ nullable: true })
  client_confirmed_at: Date;

  @Column({ nullable: true })
  started_at: Date;

  @Column({ nullable: true })
  completed_at: Date;

  @Column({ nullable: true })
  cancelled_at: Date;

  @Column({ type: 'enum', enum: CancelledBy, nullable: true })
  cancelled_by: CancelledBy | null;

  @Column({ nullable: true })
  cancellation_reason: string;

  @OneToMany(() => TripOffer, (offer) => offer.trip, { cascade: false })
  offers: TripOffer[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
