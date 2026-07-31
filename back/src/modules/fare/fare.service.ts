import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FareConfig } from './entities/fare-config.entity';
import { SetFareConfigDto } from './dto/set-fare-config.dto';
import axios from 'axios';

export interface RouteInfo {
  distance_km: number;
  duration_min: number;
  geometry: GeoJsonLineString | null;  // null cuando se usa Haversine como fallback
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];  // [lng, lat] — orden Mapbox
}

export interface FareEstimate {
  base_fare: number;
  distance_km: number;
  duration_min: number;
  subtotal: number;
  night_surcharge: number;
  total: number;
  is_night_rate: boolean;
  max_negotiation_discount_pct: number;
  route_geometry: GeoJsonLineString | null;
}

@Injectable()
export class FareService {
  // Caché en memoria — la config de tarifas cambia raramente (ajustes del dueño)
  // pero se lee en cada ping GPS de cada conductor en viaje.
  private configCache: FareConfig | null = null;
  private configCacheExpiry = 0;
  // Los precios (km, minuto, base) son regulados por la ANT y cambian rarísimo.
  // El caché dura 30 días; se actualiza inmediatamente cuando el dueño lo cambia vía setConfig().
  private static readonly CONFIG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(FareConfig)
    private configRepo: Repository<FareConfig>,
  ) {}

  // ── Configuración ────────────────────────────────────────────────────────────

  async getConfig(): Promise<FareConfig> {
    if (this.configCache && Date.now() < this.configCacheExpiry) {
      return this.configCache;
    }
    const config = await this.configRepo.findOne({ where: {} })
      ?? await this.configRepo.save(this.configRepo.create());
    this.configCache = config;
    this.configCacheExpiry = Date.now() + FareService.CONFIG_TTL_MS;
    return config;
  }

  async setConfig(dto: SetFareConfigDto): Promise<FareConfig> {
    const config = await this.getConfig();
    Object.assign(config, dto);
    const saved = await this.configRepo.save(config);
    // Actualizar caché inmediatamente para que los conductores activos vean el cambio
    this.configCache = saved;
    this.configCacheExpiry = Date.now() + FareService.CONFIG_TTL_MS;
    return saved;
  }

  // ── Google Maps — distancia y duración ───────────────────────────────────────

  async getRouteInfo(
    originLat: number, originLng: number,
    destLat: number, destLng: number,
  ): Promise<RouteInfo> {
    const token = process.env.MAPBOX_ACCESS_TOKEN;

    if (!token) {
      return this.haversineRoute(originLat, originLng, destLat, destLng);
    }

    try {
      // Mapbox usa orden lng,lat (no lat,lng)
      // driving-traffic usa datos de tráfico en tiempo real para distancia y duración reales
      // overview=full + geometries=geojson devuelven la geometría de ruta completa
      const coords = `${originLng},${originLat};${destLng},${destLat}`;
      const res = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}`,
        {
          params: { access_token: token, overview: 'full', geometries: 'geojson' },
          timeout: 5000,
        },
      );

      const route = res.data?.routes?.[0];
      if (!route) return this.haversineRoute(originLat, originLng, destLat, destLng);

      const result = {
        distance_km: +(route.distance / 1000).toFixed(2),
        duration_min: Math.ceil(route.duration / 60),
        geometry: route.geometry as GeoJsonLineString,
      };
      console.log(`[Mapbox] ${result.distance_km}km, ${result.duration_min}min`);
      return result;
    } catch {
      return this.haversineRoute(originLat, originLng, destLat, destLng);
    }
  }

  // ── Estimación de tarifa ─────────────────────────────────────────────────────

  async estimateFare(
    originLat: number, originLng: number,
    destLat: number, destLng: number,
  ): Promise<FareEstimate> {
    const [route, config] = await Promise.all([
      this.getRouteInfo(originLat, originLng, destLat, destLng),
      this.getConfig(),
    ]);
    return this.calculateFare(route, config);
  }

  private haversineRoute(lat1: number, lng1: number, lat2: number, lng2: number): RouteInfo {
    const distance_km = this.haversineDistance(lat1, lng1, lat2, lng2);
    const duration_min = Math.ceil((distance_km / 30) * 60);
    return { distance_km, duration_min, geometry: null };
  }

  calculateFare(route: RouteInfo, config: FareConfig): FareEstimate {
    const isNight = this.isNightTime(config);
    const base    = parseFloat(config.base_fare as any);
    const perKm   = isNight
      ? parseFloat(config.night_price_per_km as any)
      : parseFloat(config.price_per_km as any);
    const perMin  = parseFloat(config.price_per_minute as any);
    const minFare = isNight
      ? parseFloat(config.night_minimum_fare as any)
      : parseFloat(config.minimum_fare as any);

    const calculated = +(base + route.distance_km * perKm).toFixed(2);
    const raw        = +Math.max(calculated, minFare).toFixed(2);
    const total      = +(Math.ceil(+(raw / 0.05).toFixed(10)) * 0.05).toFixed(2);

    return {
      base_fare:      base,
      distance_km:    route.distance_km,
      duration_min:   route.duration_min,
      subtotal:       total,
      night_surcharge: 0,
      total,
      is_night_rate:  isNight,
      max_negotiation_discount_pct: parseFloat(config.max_negotiation_discount_pct as any),
      route_geometry: route.geometry,
    };
  }

  // Verifica si una posición está sobre la ruta planificada (dentro del umbral en metros)
  isOnRoute(lat: number, lng: number, geometry: GeoJsonLineString, thresholdM: number): boolean {
    for (const [pLng, pLat] of geometry.coordinates) {
      const distM = this.haversineDistance(lat, lng, pLat, pLng) * 1000;
      if (distM <= thresholdM) return true;
    }
    return false;
  }

  // Actualiza el taxímetro con cada ping de ubicación del conductor.
  // Aplica el recargo nocturno automáticamente si el horario lo requiere.
  updateMeter(
    currentAmount: number,
    distanceKm: number,
    durationMin: number,
    speedKmh: number,
    config: FareConfig,
  ): number {
    const isNight   = this.isNightTime(config);
    const perKm     = isNight
      ? parseFloat(config.night_price_per_km as any)
      : parseFloat(config.price_per_km as any);
    const perMin    = parseFloat(config.price_per_minute as any);
    const threshold = parseFloat(config.slow_speed_threshold_kmh as any);

    const increment = speedKmh < threshold
      ? durationMin * perMin   // parado/lento: cobra por tiempo
      : distanceKm * perKm;    // en marcha: cobra por distancia

    return +(currentAmount + increment).toFixed(2);
  }

  // Velocidad de crecimiento del taxímetro en $/segundo para animación fluida en el frontend.
  // El cliente anima display = meter_amount + increment_per_second * elapsed_s entre pings GPS.
  calculateIncrementPerSecond(speedKmh: number, config: FareConfig): number {
    const isNight   = this.isNightTime(config);
    const perKm     = isNight
      ? parseFloat(config.night_price_per_km as any)
      : parseFloat(config.price_per_km as any);
    const perMin    = parseFloat(config.price_per_minute as any);
    const threshold = parseFloat(config.slow_speed_threshold_kmh as any);

    if (speedKmh < threshold) {
      return +((perMin / 60)).toFixed(6);           // $/s parado
    } else {
      return +(((speedKmh * perKm) / 3600)).toFixed(6); // $/s en marcha
    }
  }

  // Distancia en línea recta entre dos puntos (km)
  haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(3);
  }



  isNightTime(config: FareConfig): boolean {
    const hour = new Date().getHours();
    const start = config.night_start_hour;
    const end = config.night_end_hour;
    // ej: start=22, end=6 → nocturno si hora >= 22 OR hora < 6
    if (start > end) return hour >= start || hour < end;
    return hour >= start && hour < end;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
