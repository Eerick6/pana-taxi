import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { Trip } from './trip.entity';

export enum OfferStatus {
  PENDING = 'pending',
  SELECTED = 'selected',   // cliente eligió esta oferta
  REJECTED = 'rejected',   // otra oferta fue elegida, o conductor la retiró
  EXPIRED = 'expired',     // el viaje fue cancelado o caducó
}

// Oferta de un conductor para un viaje de precio fijo (fare_mode = negotiated).
// Un viaje puede tener múltiples ofertas pendientes; el cliente elige la que prefiera.
@Entity('trip_offers')
export class TripOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Trip, (trip) => trip.offers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column()
  trip_id: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column()
  driver_id: string;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  // Monto ofrecido por el conductor. null = acepta exactamente el precio del cliente.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number | null;

  // Tiempo estimado en minutos para que el conductor llegue al punto de recogida
  @Column({ type: 'smallint', nullable: true })
  eta_pickup_min: number | null;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status: OfferStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
