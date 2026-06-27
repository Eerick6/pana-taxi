import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

// Configuración global de tarifas — refleja la regulación ANT.
// Única fila en la tabla. Las comisiones por cooperativa van en la entidad Cooperative.
@Entity('fare_configs')
export class FareConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Tarifa de arranque (mínimo al subir al taxi)
  @Column({ type: 'decimal', precision: 8, scale: 2, default: '1.50' })
  base_fare: number;

  // Precio por kilómetro recorrido
  @Column({ type: 'decimal', precision: 8, scale: 4, default: '0.4000' })
  price_per_km: number;

  // Precio por minuto cuando la velocidad baja del umbral (taxímetro en espera)
  @Column({ type: 'decimal', precision: 8, scale: 4, default: '0.0800' })
  price_per_minute: number;

  // Velocidad umbral para cambiar de cobro por distancia a cobro por tiempo (km/h)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '10.00' })
  slow_speed_threshold_kmh: number;

  // Recargo nocturno en % sobre la tarifa calculada (ej. 25 = +25%)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '25.00' })
  night_surcharge_pct: number;

  // Horario del recargo nocturno (formato 24h)
  @Column({ type: 'tinyint', default: 22 })
  night_start_hour: number;

  @Column({ type: 'tinyint', default: 6 })
  night_end_hour: number;

  // Radio inicial para mostrar viajes al conductor (km)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '5.00' })
  search_radius_km: number;

  // Radio máximo al que puede crecer (km)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '20.00' })
  radius_max_km: number;

  // Cuántos km crece el radio en cada expansión
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '1.00' })
  radius_expansion_km: number;

  // Cada cuántos segundos expande el radio si no hay conductor
  @Column({ type: 'smallint', default: 60 })
  radius_expansion_interval_sec: number;

  // Tarifa mínima por viaje (ningún viaje puede cerrarse por menos de esto)
  @Column({ type: 'decimal', precision: 8, scale: 2, default: '1.50' })
  minimum_fare: number;

  // Descuento máximo que puede ofrecer el cliente en modo negociación (%)
  // Ej: 30 → el cliente no puede ofrecer menos del 70% de la tarifa sugerida
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '30.00' })
  max_negotiation_discount_pct: number;

  // Distancia máxima de la ruta planificada antes de considerar desvío (metros)
  @Column({ type: 'smallint', default: 300 })
  deviation_threshold_m: number;

  // Frecuencia de envío de ubicación sin viaje activo (modo flota — panel web)
  @Column({ type: 'smallint', default: 60 })
  location_interval_fleet_sec: number;

  // Frecuencia de envío de ubicación durante un viaje activo (modo seguimiento — cliente)
  @Column({ type: 'smallint', default: 5 })
  location_interval_trip_sec: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
