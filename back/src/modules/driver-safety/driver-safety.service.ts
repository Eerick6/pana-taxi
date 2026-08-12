import { Inject, Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { TripSafetyCheck } from './entities/trip-safety-check.entity';
import { TripDeviationAlert, DeviationAlertStatus } from './entities/trip-deviation-alert.entity';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { FareService, GeoJsonLineString } from '../fare/fare.service';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ResolveDeviationAlertDto } from './dto/resolve-deviation-alert.dto';

const PLATFORM_RESPONDERS = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT, UserRole.MONITORING];
const COOP_RESPONDERS = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR];

@Injectable()
export class DriverSafetyService {
  private readonly logger = new Logger(DriverSafetyService.name);

  // 1km sostenido por 15min → alerta a la cooperativa y a plataforma.
  // Independiente del deviation_threshold_m (300m por defecto) que ya usa
  // events.gateway.ts para re-rutear en vivo en cada ping — ese es para
  // mantener la navegación correcta, este es para seguridad.
  private static readonly DEVIATION_THRESHOLD_M = 1000;
  private static readonly DEVIATION_GRACE_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(TripSafetyCheck)
    private safetyChecksRepo: Repository<TripSafetyCheck>,
    @InjectRepository(TripDeviationAlert)
    private deviationAlertsRepo: Repository<TripDeviationAlert>,
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private storage: StorageService,
    private fareService: FareService,
    private gateway: EventsGateway,
    private notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  // ── Selfies de verificación ───────────────────────────────────────────────────

  async uploadSafetyCheck(userId: string, tripId: string, file: Express.Multer.File) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, driver: { id: driver.id } },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado o no te pertenece');
    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException('El viaje debe estar en progreso');
    }

    if (!file) throw new BadRequestException('Archivo requerido');
    const allowedMimes = ['image/jpeg', 'image/png'];
    if (!allowedMimes.includes(file.mimetype)) throw new BadRequestException('Solo JPEG o PNG');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Máximo 5MB');

    const key = await this.storage.upload(`trips/${tripId}/safety`, file.originalname, file.buffer, file.mimetype);

    await this.safetyChecksRepo.save(
      this.safetyChecksRepo.create({ trip_id: tripId, driver_id: driver.id, photo_key: key }),
    );

    return { message: 'ok' };
  }

  async getSafetyChecks(user: User, tripId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId },
      relations: ['cooperative', 'driver'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    this.assertCanViewTrip(user, trip);

    const checks = await this.safetyChecksRepo.find({
      where: { trip_id: tripId },
      order: { captured_at: 'DESC' },
    });

    const items = await Promise.all(
      checks.map(async (c) => ({
        id: c.id,
        captured_at: c.captured_at,
        photo_url: await this.storage.getPresignedUrl(c.photo_key),
      })),
    );
    return { items };
  }

  private assertCanViewTrip(user: User, trip: Trip) {
    if (PLATFORM_RESPONDERS.includes(user.role)) return;
    const isCoopStaff = [UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR].includes(user.role);
    if (isCoopStaff && user.cooperative_id && trip.cooperative?.id === user.cooperative_id) return;
    throw new ForbiddenException('No tienes acceso a este viaje');
  }

  // ── Alertas de desviación sostenida ───────────────────────────────────────────

  async getDeviationAlerts(user: User, status?: DeviationAlertStatus, page = 1, limit = 20) {
    const qb = this.deviationAlertsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.driver', 'driver')
      .leftJoinAndSelect('a.trip', 'trip')
      .orderBy('a.triggered_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('a.status = :status', { status });

    if (!PLATFORM_RESPONDERS.includes(user.role)) {
      if (!user.cooperative_id) throw new ForbiddenException('No estás asociado a ninguna cooperativa');
      qb.andWhere('a.cooperative_id = :coopId', { coopId: user.cooperative_id });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async resolveDeviationAlert(user: User, alertId: string, dto: ResolveDeviationAlertDto) {
    const alert = await this.deviationAlertsRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    if (!PLATFORM_RESPONDERS.includes(user.role)) {
      if (!user.cooperative_id || alert.cooperative_id !== user.cooperative_id) {
        throw new ForbiddenException('No tienes acceso a esta alerta');
      }
    }
    if (alert.status === DeviationAlertStatus.RESOLVED) {
      throw new BadRequestException('Esta alerta ya fue resuelta');
    }

    await this.deviationAlertsRepo.update(alertId, {
      status: DeviationAlertStatus.RESOLVED,
      resolved_by_id: user.id,
      resolved_at: new Date(),
      resolution_notes: dto.resolution_notes ?? null,
    });
    return { message: 'Alerta resuelta' };
  }

  // ── Cron: detecta desvío sostenido en viajes IN_PROGRESS ──────────────────────

  @Cron('*/3 * * * *')
  async checkRouteDeviations() {
    const trips = await this.tripsRepo.find({
      where: { status: TripStatus.IN_PROGRESS },
      relations: ['driver', 'cooperative'],
    });

    for (const trip of trips) {
      try {
        await this.checkOneTrip(trip);
      } catch (err) {
        this.logger.error(`[deviation] error revisando trip ${trip.id}: ${err.message}`);
      }
    }
  }

  private async checkOneTrip(trip: Trip) {
    if (!trip.route_geometry || !trip.driver) return;

    let geometry: GeoJsonLineString;
    try {
      geometry = JSON.parse(trip.route_geometry);
    } catch {
      return;
    }

    const loc = await this.getDriverLocationFromRedis(trip.driver.id);
    if (!loc) return; // sin señal reciente — lo cubre el chequeo de inactividad, no este

    const onRoute = this.fareService.isOnRoute(loc.lat, loc.lng, geometry, DriverSafetyService.DEVIATION_THRESHOLD_M);

    if (onRoute) {
      if (trip.deviation_started_at) {
        await this.tripsRepo.update(trip.id, { deviation_started_at: null, deviation_alert_sent_at: null });
      }
      return;
    }

    if (!trip.deviation_started_at) {
      await this.tripsRepo.update(trip.id, { deviation_started_at: new Date() });
      return;
    }

    const deviatedForMs = Date.now() - new Date(trip.deviation_started_at).getTime();
    if (deviatedForMs < DriverSafetyService.DEVIATION_GRACE_MS) return;
    if (trip.deviation_alert_sent_at) return; // ya se avisó para este episodio

    await this.tripsRepo.update(trip.id, { deviation_alert_sent_at: new Date() });

    const alert = await this.deviationAlertsRepo.save(
      this.deviationAlertsRepo.create({
        trip_id: trip.id,
        driver_id: trip.driver.id,
        cooperative_id: trip.cooperative?.id ?? null,
        lat: loc.lat,
        lng: loc.lng,
      }),
    );

    await this.notifyDeviation(trip, alert, loc);
  }

  private async getDriverLocationFromRedis(driverId: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const raw = await this.redis.get(`driver:location:${driverId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
      return { lat: parsed.lat, lng: parsed.lng };
    } catch {
      return null;
    }
  }

  private async notifyDeviation(trip: Trip, alert: TripDeviationAlert, loc: { lat: number; lng: number }) {
    const payload = {
      alert_id: alert.id,
      trip_id: trip.id,
      driver_id: trip.driver.id,
      lat: loc.lat,
      lng: loc.lng,
      triggered_at: alert.triggered_at,
    };

    this.gateway.notifyPlatform('driver.deviation_alert', payload);
    if (trip.cooperative?.id) {
      this.gateway.notifyCoop(trip.cooperative.id, 'driver.deviation_alert', payload);
    }

    const platformStaff = await this.usersRepo.find({
      where: PLATFORM_RESPONDERS.map((role) => ({ role })),
      select: ['id'],
    });
    const staffIds = platformStaff.map((u) => u.id);

    if (trip.cooperative?.id) {
      const coopStaff = await this.usersRepo.find({
        where: [
          { role: UserRole.COOPERATIVE_ADMIN, cooperative_id: trip.cooperative.id },
          { role: UserRole.COOPERATIVE_OPERATOR, cooperative_id: trip.cooperative.id },
        ],
        select: ['id'],
      });
      staffIds.push(...coopStaff.map((u) => u.id));
    }

    if (staffIds.length > 0) {
      await this.notifications.sendToUsers(staffIds, {
        title: '⚠️ Conductor desviado de la ruta',
        body: 'Un conductor lleva más de 15 minutos fuera de la ruta planeada. Verifica que esté bien.',
        data: { type: 'route_deviation', trip_id: trip.id, alert_id: alert.id },
      });
    }

    this.logger.warn(`[deviation] alerta ${alert.id} para trip ${trip.id} (driver ${trip.driver.id})`);
  }
}
