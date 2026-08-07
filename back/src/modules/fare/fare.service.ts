import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
  // Caché en memoria keyed by 'global' o cooperativeId.
  // Los precios son regulados por la ANT y cambian rarísimo — TTL 30 días.
  // Se invalida inmediatamente en cada setConfig / setCoopConfig.
  private configCaches = new Map<string, { config: FareConfig; expiry: number }>();
  private static readonly CONFIG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(FareConfig)
    private configRepo: Repository<FareConfig>,
  ) {}

  // ── Configuración ────────────────────────────────────────────────────────────

  // Devuelve la config de la coop si existe, si no la global.
  async getConfig(cooperativeId?: string): Promise<FareConfig> {
    if (cooperativeId) {
      const coopCached = this.configCaches.get(cooperativeId);
      if (coopCached && Date.now() < coopCached.expiry) return coopCached.config;
      const coopConfig = await this.configRepo.findOne({ where: { cooperative_id: cooperativeId } });
      if (coopConfig) {
        this.configCaches.set(cooperativeId, { config: coopConfig, expiry: Date.now() + FareService.CONFIG_TTL_MS });
        return coopConfig;
      }
    }
    return this.getGlobalConfig();
  }

  private async getGlobalConfig(): Promise<FareConfig> {
    const globalCached = this.configCaches.get('global');
    if (globalCached && Date.now() < globalCached.expiry) return globalCached.config;
    const config = await this.configRepo.findOne({ where: { cooperative_id: IsNull() } })
      ?? await this.configRepo.save(this.configRepo.create({ cooperative_id: null }));
    this.configCaches.set('global', { config, expiry: Date.now() + FareService.CONFIG_TTL_MS });
    return config;
  }

  async setConfig(dto: SetFareConfigDto): Promise<FareConfig> {
    const config = await this.getGlobalConfig();
    Object.assign(config, dto);
    const saved = await this.configRepo.save(config);
    this.configCaches.set('global', { config: saved, expiry: Date.now() + FareService.CONFIG_TTL_MS });
    return saved;
  }

  async setCoopConfig(cooperativeId: string, dto: SetFareConfigDto): Promise<FareConfig> {
    let config = await this.configRepo.findOne({ where: { cooperative_id: cooperativeId } });
    if (!config) {
      config = this.configRepo.create({ cooperative_id: cooperativeId });
    }
    Object.assign(config, dto);
    const saved = await this.configRepo.save(config);
    this.configCaches.set(cooperativeId, { config: saved, expiry: Date.now() + FareService.CONFIG_TTL_MS });
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
      // driving (sin tráfico) — suficiente para taxis urbanos, responde ~3x más rápido que driving-traffic
      // overview=full + geometries=geojson devuelven la geometría de ruta completa
      const coords = `${originLng},${originLat};${destLng},${destLat}`;
      const res = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`,
        {
          params: { access_token: token, overview: 'full', geometries: 'geojson' },
          timeout: 3000,
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
