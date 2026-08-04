import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

// Configuración de tarifas por cooperativa (o global cuando cooperative_id IS NULL).
// La fila global (cooperative_id = null) aplica a todas las coops sin config propia.
@Entity('fare_configs')
export class FareConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // null → configuración global; uuid → configuración específica de esa cooperativa
  @Column({ type: 'varchar', length: 36, nullable: true, unique: true })
  cooperative_id: string | null;

  // ── Tarifa diurna (06:00–22:00) ─────────────────────────────────────────────

  // Bajada de bandera (arranque) — igual día y noche
  @Column({ type: 'decimal', precision: 8, scale: 2, default: '0.50' })
  base_fare: number;

  // Precio por kilómetro diurno
  @Column({ type: 'decimal', precision: 8, scale: 4, default: '0.4000' })
  price_per_km: number;

  // Precio por minuto parado — igual día y noche
  @Column({ type: 'decimal', precision: 8, scale: 4, default: '0.1000' })
  price_per_minute: number;

  // Carrera mínima diurna
  @Column({ type: 'decimal', precision: 8, scale: 2, default: '1.50' })
  minimum_fare: number;

  // ── Tarifa nocturna (22:00–06:00) ────────────────────────────────────────────

  // Precio por kilómetro nocturno
  @Column({ type: 'decimal', precision: 8, scale: 4, default: '0.4500' })
  night_price_per_km: number;

  // Carrera mínima nocturna
  @Column({ type: 'decimal', precision: 8, scale: 2, default: '1.70' })
  night_minimum_fare: number;

  // Horario nocturno (formato 24h)
  @Column({ type: 'tinyint', default: 22 })
  night_start_hour: number;

  @Column({ type: 'tinyint', default: 6 })
  night_end_hour: number;

  // Velocidad umbral para cambiar de cobro por distancia a cobro por tiempo (km/h)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '10.00' })
  slow_speed_threshold_kmh: number;

  // Radio inicial para mostrar viajes al conductor (km)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '1.00' })
  search_radius_km: number;

  // Radio máximo al que puede crecer (km)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '10.00' })
  radius_max_km: number;

  // Cuántos km crece el radio en cada expansión
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '1.00' })
  radius_expansion_km: number;

  // Cada cuántos segundos expande el radio si no hay conductor
  @Column({ type: 'smallint', default: 30 })
  radius_expansion_interval_sec: number;

  // Descuento máximo que puede ofrecer el cliente en modo negociación (%)
  // 15 → el cliente no puede ofrecer menos del 85% de la tarifa sugerida (protege al taxista)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: '15.00' })
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

  // Tiempo máximo de búsqueda de conductor (segundos) antes de cancelar automáticamente
  @Column({ type: 'smallint', default: 300 })
  trip_timeout_sec: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
