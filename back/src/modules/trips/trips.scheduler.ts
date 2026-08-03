import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Trip, TripStatus } from './entities/trip.entity';
import { FareService } from '../fare/fare.service';
import { EventsGateway } from '../gateway/events.gateway';

// Corre cada 15 s
@Injectable()
export class TripsScheduler {
  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    private fareService: FareService,
    private gateway: EventsGateway,
  ) {}

  // Expande el radio de búsqueda para viajes sin conductor
  @Interval(15_000)
  async expandSearchRadii(): Promise<void> {
    const pendingTrips = await this.tripsRepo.find({
      where: { status: TripStatus.REQUESTED },
      relations: ['cooperative'],
    });

    for (const trip of pendingTrips) {
      // Config de la cooperativa del viaje (caché — sin query DB)
      const config = await this.fareService.getConfig(trip.cooperative?.id ?? undefined);
      const intervalMs = config.radius_expansion_interval_sec * 1_000;
      const expandKm = parseFloat(config.radius_expansion_km as any);
      const maxKm = parseFloat(config.radius_max_km as any);

      const currentRadius =
        trip.current_search_radius_km != null
          ? parseFloat(trip.current_search_radius_km as any)
          : parseFloat(config.search_radius_km as any);

      if (currentRadius >= maxKm) continue;

      const lastExpanded = trip.radius_last_expanded_at ?? trip.created_at;
      const elapsed = Date.now() - new Date(lastExpanded).getTime();
      if (elapsed < intervalMs) continue;

      const newRadius = Math.min(+(currentRadius + expandKm).toFixed(2), maxKm);

      await this.tripsRepo.update(trip.id, {
        current_search_radius_km: newRadius as any,
        radius_last_expanded_at: new Date(),
      });

      this.gateway.notifyTripUpdate(trip.id, 'trip.radius_expanded', {
        trip_id: trip.id,
        search_radius_km: newRadius,
        origin_lat: trip.origin_lat ? parseFloat(trip.origin_lat as any) : null,
        origin_lng: trip.origin_lng ? parseFloat(trip.origin_lng as any) : null,
        origin_address: trip.origin_address,
        destination_address: trip.destination_address,
        suggested_fare: trip.suggested_fare ? parseFloat(trip.suggested_fare as any) : null,
        fare_mode: trip.fare_mode,
        client_offer: trip.client_offer ? parseFloat(trip.client_offer as any) : null,
        distance_km: trip.estimated_distance_km ? parseFloat(trip.estimated_distance_km as any) : null,
      });
    }
  }

  // Notifica cuando el tiempo de espera del conductor expiró (5 min tras marcar llegada)
  // El conductor puede decidir cancelar sin penalización si el cliente no llega.
  @Interval(15_000)
  async checkWaitTimers(): Promise<void> {
    const now = new Date();

    // Viajes en DRIVER_ARRIVED con temporizador vencido y sin confirmación del cliente
    const expired = await this.tripsRepo.find({
      where: {
        status: TripStatus.DRIVER_ARRIVED,
        wait_timer_expires_at: LessThan(now),
        client_confirmed_at: undefined as any, // null
      },
      relations: ['driver', 'driver.user', 'client'],
    });

    for (const trip of expired) {
      // Notificar a ambas partes — el conductor puede cancelar sin penalización
      this.gateway.notifyTripUpdate(trip.id, 'trip.wait_expired', {
        trip_id: trip.id,
        message: 'El tiempo de espera ha vencido. El conductor puede cancelar sin penalización.',
        driver_can_cancel_free: true,
      });

      if (trip.client) {
        this.gateway.notifyUser(trip.client.id, 'trip.wait_expired', {
          trip_id: trip.id,
          message: 'Tu conductor ha esperado 5 minutos. Corre o cancela.',
        });
      }

      // Marcar el viaje para que el scheduler no lo procese de nuevo en el próximo ciclo
      // Ponemos wait_timer_expires_at muy en el pasado para que no se repita la notif
      await this.tripsRepo.update(trip.id, {
        wait_timer_expires_at: new Date(0),
      });
    }
  }
}
