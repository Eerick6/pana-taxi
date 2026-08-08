import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Trip, TripStatus, CancelledBy } from '../../modules/trips/entities/trip.entity';
import { FareService } from '../../modules/fare/fare.service';
import { EventsGateway } from '../../modules/gateway/events.gateway';

export const TRIP_EXPANSION_QUEUE = 'trip-expansion';
export const EXPAND_RADIUS_JOB = 'expand-radius';
export const TRIP_TIMEOUT_JOB = 'trip-timeout';

export interface TripExpansionJobData {
  tripId: string;
}

@Processor(TRIP_EXPANSION_QUEUE, { drainDelay: 300 })
export class TripExpansionProcessor extends WorkerHost {
  private readonly logger = new Logger(TripExpansionProcessor.name);

  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    private fareService: FareService,
    private gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<TripExpansionJobData>): Promise<void> {
    if (job.name === TRIP_TIMEOUT_JOB) {
      await this._handleTimeout(job.data.tripId);
      return;
    }

    if (job.name !== EXPAND_RADIUS_JOB) return;

    const { tripId } = job.data;
    const trip = await this.tripsRepo.findOne({ where: { id: tripId } });
    if (!trip || trip.status !== TripStatus.REQUESTED) return;

    const config = await this.fareService.getConfig();
    const expandKm = parseFloat(config.radius_expansion_km as any);
    const maxKm = parseFloat(config.radius_max_km as any);
    const currentRadius = trip.current_search_radius_km != null
      ? parseFloat(trip.current_search_radius_km as any)
      : parseFloat(config.search_radius_km as any);

    if (currentRadius >= maxKm) return;

    const newRadius = Math.min(+(currentRadius + expandKm).toFixed(2), maxKm);

    // Re-verificar status antes de emitir — el cliente pudo cancelar durante el job
    const check = await this.tripsRepo.findOne({ where: { id: tripId } });
    if (!check || check.status !== TripStatus.REQUESTED) return;

    await this.tripsRepo.update(tripId, {
      current_search_radius_km: newRadius as any,
      radius_last_expanded_at: new Date(),
    });

    this.gateway.notifyTripUpdate(tripId, 'trip.radius_expanded', { trip_id: tripId, search_radius_km: newRadius });
    this.logger.log(`Trip ${tripId}: radius ${currentRadius} → ${newRadius} km`);
  }

  private async _handleTimeout(tripId: string): Promise<void> {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId },
      relations: ['client'],
    });
    if (!trip || trip.status !== TripStatus.REQUESTED) return;

    await this.tripsRepo.update(tripId, {
      status: TripStatus.CANCELLED,
      cancelled_by: CancelledBy.PLATFORM,
      cancellation_reason: 'no_drivers',
      cancelled_at: new Date(),
    });

    const payload = {
      trip_id: tripId,
      status: TripStatus.CANCELLED,
      cancelled_by: CancelledBy.PLATFORM,
      reason: 'no_drivers',
    };

    // Client socket is in ROOM.user(id) during search, not ROOM.trip(id)
    if (trip.client?.id) {
      this.gateway.notifyUser(trip.client.id, 'trip.cancelled', payload);
    }
    this.gateway.notifyTripUpdate(tripId, 'trip.cancelled', payload);

    this.logger.log(`Trip ${tripId} auto-cancelled: timeout reached, no drivers accepted`);
  }
}
