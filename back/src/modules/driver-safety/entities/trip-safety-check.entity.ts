import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { Driver } from '../../drivers/entities/driver.entity';

// Selfie de verificación tomada automáticamente durante un viaje (seguridad
// del taxista: confirmar que quien maneja es el conductor registrado).
@Entity('trip_safety_checks')
@Index('IDX_trip_safety_checks_trip', ['trip'])
export class TripSafetyCheck {
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

  // Clave de almacenamiento (R2) — privada, se firma bajo demanda al listar
  @Column()
  photo_key: string;

  @CreateDateColumn()
  captured_at: Date;
}
