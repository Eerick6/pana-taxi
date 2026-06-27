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

      return {
        distance_km: +(route.distance / 1000).toFixed(2),
        duration_min: Math.ceil(route.duration / 60),
        geometry: route.geometry as GeoJsonLineString,
      };
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
    const base = parseFloat(config.base_fare as any);
    const perKm = parseFloat(config.price_per_km as any);
    const perMin = parseFloat(config.price_per_minute as any);

    const subtotal = +(base + route.distance_km * perKm + route.duration_min * perMin).toFixed(2);
    const isNight = this.isNightTime(config);
    const nightSurcharge = isNight
      ? +(subtotal * (parseFloat(config.night_surcharge_pct as any) / 100)).toFixed(2)
      : 0;

    return {
      base_fare: base,
      distance_km: route.distance_km,
      duration_min: route.duration_min,
      subtotal,
      night_surcharge: nightSurcharge,
      total: +(subtotal + nightSurcharge).toFixed(2),
      is_night_rate: isNight,
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
    const perKm = parseFloat(config.price_per_km as any);
    const perMin = parseFloat(config.price_per_minute as any);
    const threshold = parseFloat(config.slow_speed_threshold_kmh as any);
    const nightMult = this.isNightTime(config)
      ? 1 + parseFloat(config.night_surcharge_pct as any) / 100
      : 1;

    const increment = (speedKmh < threshold
      ? durationMin * perMin    // taxi lento/parado: cobra por tiempo
      : distanceKm * perKm      // taxi en marcha: cobra por distancia
    ) * nightMult;

    return +(currentAmount + increment).toFixed(2);
  }

  // Velocidad de crecimiento del taxímetro en $/segundo para animación fluida en el frontend.
  // El cliente anima display = meter_amount + increment_per_second * elapsed_s entre pings GPS.
  calculateIncrementPerSecond(speedKmh: number, config: FareConfig): number {
    const perKm = parseFloat(config.price_per_km as any);
    const perMin = parseFloat(config.price_per_minute as any);
    const threshold = parseFloat(config.slow_speed_threshold_kmh as any);
    const nightMult = this.isNightTime(config)
      ? 1 + parseFloat(config.night_surcharge_pct as any) / 100
      : 1;

    if (speedKmh < threshold) {
      // Parado/lento: cobra por minuto → $/s = perMin / 60
      return +((perMin / 60) * nightMult).toFixed(6);
    } else {
      // En marcha: cobra por km → $/s = (km/h × $/km) / 3600
      return +(((speedKmh * perKm) / 3600) * nightMult).toFixed(6);
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
