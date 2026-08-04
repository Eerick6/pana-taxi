import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull } from 'typeorm';
import { Trip, TripSource, TripStatus, FareMode, CancelledBy } from './entities/trip.entity';
import { TripOffer, OfferStatus } from './entities/trip-offer.entity';
import { Driver, DriverApprovalStatus, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { SystemConfig } from '../platform/entities/system-config.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { EventsGateway } from '../gateway/events.gateway';
import { FareService } from '../fare/fare.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { MakeOfferDto } from './dto/make-offer.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { DriversService } from '../drivers/drivers.service';
import { Stand } from '../stands/entities/stand.entity';
import { StandAssignment } from '../stands/entities/stand-assignment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountingService } from '../accounting/accounting.service';
import { Client } from '../clients/entities/client.entity';

const DEFAULT_COMMISSION_RATE_PCT = 10;

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(TripOffer)
    private tripOffersRepo: Repository<TripOffer>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(VehicleAssignment)
    private vehicleAssignmentsRepo: Repository<VehicleAssignment>,
    @InjectRepository(CooperativeOwner)
    private coopOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(CooperativeMember)
    private coopMembersRepo: Repository<CooperativeMember>,
    @InjectRepository(SystemConfig)
    private configRepo: Repository<SystemConfig>,
    @InjectRepository(DriverWallet)
    private walletRepo: Repository<DriverWallet>,
    @InjectDataSource()
    private dataSource: DataSource,
    private walletService: WalletService,
    private gateway: EventsGateway,
    private fareService: FareService,
    private driversService: DriversService,
    @InjectRepository(Stand)
    private standsRepo: Repository<Stand>,
    @InjectRepository(StandAssignment)
    private standAssignmentsRepo: Repository<StandAssignment>,
    @InjectRepository(Client)
    private clientsRepo: Repository<Client>,
    private notificationsService: NotificationsService,
    private accountingService: AccountingService,
  ) {}

  // ── Crear viaje ──────────────────────────────────────────────────────────────

  async createTrip(user: User, dto: CreateTripDto): Promise<Trip> {
    const fareMode = dto.fare_mode ?? FareMode.METER;

    if (user.role === UserRole.CLIENT) {
      // Bloquear si el cliente ya tiene un viaje activo o pendiente
      const existing = await this.tripsRepo.findOne({
        where: {
          client: { id: user.id },
          status: In([TripStatus.REQUESTED, TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
        },
      });
      if (existing) {
        throw new ConflictException('Ya tienes un viaje activo. Cancela el viaje actual para crear uno nuevo.');
      }

      const rate = await this.resolveCommissionRate(null);
      const estimate = await this.fareService.estimateFare(
        dto.origin_lat, dto.origin_lng,
        dto.destination_lat, dto.destination_lng,
      );

      const fareConfig = await this.fareService.getConfig();

      if (fareMode === FareMode.NEGOTIATED && dto.client_offer != null) {
        const maxDiscount = parseFloat(fareConfig.max_negotiation_discount_pct as any);
        const minAcceptable = +(estimate.total * (1 - maxDiscount / 100)).toFixed(2);
        if (dto.client_offer < minAcceptable) {
          throw new BadRequestException(
            `La oferta mínima permitida es $${minAcceptable} (${100 - maxDiscount}% de la tarifa sugerida $${estimate.total})`,
          );
        }
      }

      const trip = await this.tripsRepo.save(
        this.tripsRepo.create({
          source: TripSource.CLIENT,
          client: user,
          fare_mode: fareMode,
          origin_address: dto.origin_address,
          origin_lat: dto.origin_lat,
          origin_lng: dto.origin_lng,
          destination_address: dto.destination_address,
          destination_lat: dto.destination_lat,
          destination_lng: dto.destination_lng,
          estimated_distance_km: estimate.distance_km,
          estimated_duration_min: estimate.duration_min,
          suggested_fare: estimate.total,
          client_offer: fareMode === FareMode.NEGOTIATED ? (dto.client_offer ?? estimate.total) : null,
          route_geometry: estimate.route_geometry ? JSON.stringify(estimate.route_geometry) : null,
          current_search_radius_km: fareConfig.search_radius_km as any,
          commission_rate: rate.toFixed(4),
        }),
      );

      // Cargar info del cliente para el overlay del taxista
      const clientProfile = await this.clientsRepo.findOne({ where: { user: { id: user.id } } });

      this.gateway.notifyNewTrip({
        trip_id: trip.id,
        origin_address: trip.origin_address,
        destination_address: trip.destination_address,
        origin_lat: parseFloat(trip.origin_lat as any),
        origin_lng: parseFloat(trip.origin_lng as any),
        search_radius_km: parseFloat(fareConfig.search_radius_km as any),
        suggested_fare: estimate.total,
        fare_mode: fareMode,
        client_offer: trip.client_offer ? parseFloat(trip.client_offer as any) : null,
        distance_km: estimate.distance_km,
        duration_min: estimate.duration_min,
        is_night_rate: estimate.is_night_rate,
        client_name: clientProfile?.full_name ?? (user as any).full_name ?? null,
        client_rating: clientProfile ? parseFloat(clientProfile.rating as any) : null,
        client_total_trips: clientProfile?.total_trips ?? 0,
      });

      return trip;
    }

    // Staff de cooperativa crea viaje
    const member = await this.coopMembersRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['cooperative'],
    });
    if (!member) throw new ForbiddenException('No perteneces a ninguna cooperativa');

    const rate = await this.resolveCommissionRate(member.cooperative.commission_override);

    // Si viene con stand_id, el origen es la parada (no la ubicación del cliente)
    let originLat = dto.origin_lat;
    let originLng = dto.origin_lng;
    let originAddress = dto.origin_address;
    let standId: string | null = null;

    if (dto.stand_id) {
      const stand = await this.standsRepo.findOne({
        where: { id: dto.stand_id, cooperative_id: member.cooperative.id, is_active: true },
      });
      if (!stand) throw new NotFoundException('Parada no encontrada o no pertenece a tu cooperativa');

      originLat = parseFloat(stand.lat as any);
      originLng = parseFloat(stand.lng as any);
      originAddress = stand.address ? `${stand.name} — ${stand.address}` : stand.name;
      standId = stand.id;
    }

    const [estimate, fareConfigCoop] = await Promise.all([
      this.fareService.estimateFare(originLat, originLng, dto.destination_lat, dto.destination_lng),
      this.fareService.getConfig(),
    ]);

    if (fareMode === FareMode.NEGOTIATED && dto.client_offer != null) {
      const maxDiscount = parseFloat(fareConfigCoop.max_negotiation_discount_pct as any);
      const minAcceptable = +(estimate.total * (1 - maxDiscount / 100)).toFixed(2);
      if (dto.client_offer < minAcceptable) {
        throw new BadRequestException(
          `La oferta mínima permitida es $${minAcceptable} (${100 - maxDiscount}% de la tarifa sugerida $${estimate.total})`,
        );
      }
    }

    const trip = await this.tripsRepo.save(
      this.tripsRepo.create({
        source: TripSource.COOPERATIVE,
        cooperative: member.cooperative,
        fare_mode: fareMode,
        walk_in_client_name: dto.walk_in_client_name ?? null,
        stand_id: standId,
        origin_address: originAddress,
        origin_lat: originLat,
        origin_lng: originLng,
        destination_address: dto.destination_address,
        destination_lat: dto.destination_lat,
        destination_lng: dto.destination_lng,
        estimated_distance_km: estimate.distance_km,
        estimated_duration_min: estimate.duration_min,
        suggested_fare: estimate.total,
        client_offer: fareMode === FareMode.NEGOTIATED ? (dto.client_offer ?? estimate.total) : null,
        route_geometry: estimate.route_geometry ? JSON.stringify(estimate.route_geometry) : null,
        current_search_radius_km: fareConfigCoop.search_radius_km as any,
        commission_rate: rate.toFixed(4),
      }),
    );

    const tripPayload = {
      trip_id: trip.id,
      origin_address: trip.origin_address,
      destination_address: trip.destination_address,
      suggested_fare: estimate.total,
      fare_mode: fareMode,
      client_offer: trip.client_offer,
      distance_km: estimate.distance_km,
      duration_min: estimate.duration_min,
      is_night_rate: estimate.is_night_rate,
      cooperative_id: member.cooperative.id,
      stand_id: standId,
    };

    if (standId) {
      // Despacho desde parada: notifica PRIMERO al primero de la cola
      const firstInQueue = await this.standAssignmentsRepo.findOne({
        where: { stand_id: standId, checked_out_at: IsNull() },
        relations: ['driver', 'driver.user'],
        order: { checked_in_at: 'ASC' },
      });

      if (firstInQueue?.driver?.user) {
        // Aviso personal al primero de la cola
        this.gateway.notifyDriver(firstInQueue.driver.id, 'trip.new', {
          ...tripPayload,
          stand_dispatch: true,
          message: 'Nuevo viaje desde tu parada. ¡Te toca!',
        });
        this.notificationsService.sendToUser(firstInQueue.driver.user.id, {
          title: '¡Te toca! Nuevo viaje',
          body: `${trip.origin_address} → ${trip.destination_address}`,
          data: { trip_id: trip.id, event: 'trip.new', stand_dispatch: 'true' },
        });
      }
      // También notifica a la sala completa de la coop (cualquier conductor puede verlo)
      this.gateway.notifyNewTrip(tripPayload, member.cooperative.id);
    } else {
      // Sin parada: broadcast normal a toda la coop
      this.gateway.notifyNewTrip(tripPayload, member.cooperative.id);
    }

    return trip;
  }

  // ── Conductores cercanos: viajes disponibles ─────────────────────────────────

  async getAvailableTrips(userId: string) {
    const driver = await this.findDriverByUser(userId);

    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado');
    }
    if (driver.online_status === DriverOnlineStatus.OFFLINE) {
      throw new ForbiddenException('Debes estar en línea para ver viajes disponibles');
    }

    const memberships = await this.coopOwnersRepo.find({
      where: { owner: { id: driver.id }, approval_status: OwnerApprovalStatus.APPROVED },
      relations: ['cooperative'],
    });
    const coopIds = memberships.map((m) => m.cooperative.id);

    const activeAssignment = await this.vehicleAssignmentsRepo.findOne({
      where: { driver: { id: driver.id }, status: AssignmentStatus.ACTIVE },
      relations: ['vehicle', 'vehicle.cooperative'],
    });
    if (activeAssignment?.vehicle?.cooperative && !coopIds.includes(activeAssignment.vehicle.cooperative.id)) {
      coopIds.push(activeAssignment.vehicle.cooperative.id);
    }

    const directVehicle = await this.vehiclesRepo.findOne({
      where: { assigned_driver: { id: driver.id }, approval_status: VehicleApprovalStatus.APPROVED },
      relations: ['cooperative'],
    });
    if (directVehicle?.cooperative && !coopIds.includes(directVehicle.cooperative.id)) {
      coopIds.push(directVehicle.cooperative.id);
    }

    const trips = await this.tripsRepo
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.cooperative', 'cooperative')
      .leftJoinAndSelect('trip.client', 'client')
      .where('trip.status = :status', { status: TripStatus.REQUESTED })
      .andWhere(
        '(trip.source = :clientSource OR (trip.source = :coopSource AND trip.cooperative_id IN (:...coopIds)))',
        {
          clientSource: TripSource.CLIENT,
          coopSource: TripSource.COOPERATIVE,
          coopIds: coopIds.length ? coopIds : ['__none__'],
        },
      )
      .orderBy('trip.created_at', 'ASC')
      .getMany();

    // Prefer real-time location from Redis; fall back to DB column
    const redisLoc = await this.driversService.getDriverLocationFromRedis(driver.id);
    const driverLat = redisLoc
      ? redisLoc.lat
      : driver.current_lat
        ? parseFloat(driver.current_lat as any)
        : null;
    const driverLng = redisLoc
      ? redisLoc.lng
      : driver.current_lng
        ? parseFloat(driver.current_lng as any)
        : null;

    if (driverLat != null && driverLng != null) {
      const fareConfig = await this.fareService.getConfig();
      const defaultRadius = parseFloat(fareConfig.search_radius_km as any);

      return trips.filter((trip) => {
        const tripRadius =
          trip.current_search_radius_km != null
            ? parseFloat(trip.current_search_radius_km as any)
            : defaultRadius;

        const dist = this.fareService.haversineDistance(
          driverLat,
          driverLng,
          parseFloat(trip.origin_lat as any),
          parseFloat(trip.origin_lng as any),
        );
        return dist <= tripRadius;
      });
    }

    return trips;
  }

  // ── Aceptar viaje ────────────────────────────────────────────────────────────
  // METER: primer conductor en llegar gana (lock pesimista).
  // NEGOTIATED: crea una oferta al precio del cliente; la selección la hace el cliente.

  async acceptTrip(tripId: string, userId: string) {
    const driver = await this.findDriverByUser(userId);

    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado para aceptar viajes');
    }

    const preCheck = await this.tripsRepo.findOne({ where: { id: tripId } });
    if (!preCheck) throw new NotFoundException('Viaje no encontrado');

    // NEGOTIATED: crear oferta al precio del cliente sin bloquear el viaje
    if (preCheck.fare_mode === FareMode.NEGOTIATED) {
      return this.makeOffer(tripId, userId, {});
    }

    // METER: primer conductor gana — lock pesimista
    const activeTrip = await this.tripsRepo.findOne({
      where: {
        driver: { id: driver.id },
        status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
      },
    });
    if (activeTrip) throw new ConflictException('Ya tienes un viaje activo');

    return this.dataSource.transaction(async (em) => {
      const trip = await em.findOne(Trip, {
        where: { id: tripId },
        relations: ['cooperative', 'client'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!trip) throw new NotFoundException('Viaje no encontrado');
      if (trip.status !== TripStatus.REQUESTED) {
        throw new ConflictException('El viaje ya no está disponible');
      }

      const vehicle = await this.findDriverVehicle(driver.id, trip);
      if (!vehicle) {
        throw new ForbiddenException('No tienes un vehículo aprobado elegible para este viaje');
      }

      const otpCode = generateOtp();

      await em.update(Trip, tripId, {
        status: TripStatus.ACCEPTED,
        driver,
        vehicle,
        accepted_at: new Date(),
        otp_code: otpCode,
      });

      await em.update(Driver, driver.id, { online_status: DriverOnlineStatus.BUSY });

      // Auto-checkout de parada si el conductor estaba en cola
      await this.standAssignmentsRepo
        .createQueryBuilder()
        .update()
        .set({ checked_out_at: new Date() })
        .where('driver_id = :driverId AND checked_out_at IS NULL', { driverId: driver.id })
        .execute();

      const fareConfig = await this.fareService.getConfig();
      const basePayload = {
        trip_id: tripId,
        driver_id: driver.id,
        status: TripStatus.ACCEPTED,
        location_update_interval_sec: fareConfig.location_interval_trip_sec,
      };

      // OTP solo al cliente
      if (trip.client) {
        this.gateway.notifyUser(trip.client.id, 'trip.accepted', { ...basePayload, otp_code: otpCode });
        this.notificationsService.sendToUser(trip.client.id, {
          title: '¡Tu taxi está en camino!',
          body: 'Un conductor aceptó tu viaje. Dirígete al punto de recogida.',
          data: { trip_id: tripId, event: 'trip.accepted' },
        });
      }
      if (trip.cooperative) {
        this.gateway.notifyCoop(trip.cooperative.id, 'trip.accepted', basePayload);
      }
      this.gateway.notifyDriver(driver.id, 'trip.accepted', basePayload);
      this.gateway.notifyTripUpdate(tripId, 'trip.accepted', basePayload);
      // Notificar a todos los conductores disponibles para que descarten el overlay
      this.gateway.notifyAvailableDrivers('trip.taken', { trip_id: tripId });

      return { message: 'Viaje aceptado. Dirígete al punto de recogida.', trip_id: tripId };
    });
  }

  // ── Oferta de conductor (precio fijo) ────────────────────────────────────────
  // Cualquier conductor en rango puede enviar una oferta. El cliente elige.

  async makeOffer(tripId: string, userId: string, dto: MakeOfferDto) {
    const driver = await this.findDriverByUser(userId);

    if (driver.approval_status !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException('Tu perfil debe estar aprobado');
    }

    // Conductor con viaje activo no puede hacer nuevas ofertas
    const driverActiveTrip = await this.tripsRepo.findOne({
      where: {
        driver: { id: driver.id },
        status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
      },
    });
    if (driverActiveTrip) throw new ConflictException('No puedes hacer ofertas mientras tienes un viaje activo');

    const trip = await this.tripsRepo.findOne({
      where: { id: tripId },
      relations: ['client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.fare_mode !== FareMode.NEGOTIATED) {
      throw new BadRequestException('Este viaje no admite ofertas de precio fijo');
    }
    if (trip.status !== TripStatus.REQUESTED) {
      throw new ConflictException('El viaje ya no está disponible para ofertas');
    }

    const fareConfig = await this.fareService.getConfig();
    const suggested = parseFloat(trip.suggested_fare as any);
    const clientPrice = parseFloat(trip.client_offer as any) ?? suggested;

    // Si el conductor especifica un monto, debe estar por encima del mínimo permitido
    if (dto.amount != null) {
      const maxDiscount = parseFloat(fareConfig.max_negotiation_discount_pct as any);
      const minAcceptable = +(suggested * (1 - maxDiscount / 100)).toFixed(2);
      if (dto.amount < minAcceptable) {
        throw new BadRequestException(`La oferta mínima es $${minAcceptable}`);
      }
    }

    // Verificar límite de 3 ofertas por conductor por viaje
    const totalOffersCount = await this.tripOffersRepo.count({
      where: { trip_id: tripId, driver_id: driver.id },
    });
    if (totalOffersCount >= 3) {
      throw new BadRequestException('Has alcanzado el límite de 3 ofertas para este viaje');
    }

    const offerAmount = dto.amount ?? clientPrice;
    const vehicle = await this.findDriverVehicle(driver.id, trip);

    // ETA del conductor al punto de recogida — Haversine / 30 km/h promedio urbano
    // No llamamos a Mapbox aquí: N taxistas haciendo oferta = N llamadas innecesarias
    let eta_pickup_min: number | null = null;
    if (driver.current_lat && driver.current_lng) {
      const distKm = this.fareService.haversineDistance(
        parseFloat(driver.current_lat as any), parseFloat(driver.current_lng as any),
        parseFloat(trip.origin_lat as any), parseFloat(trip.origin_lng as any),
      );
      eta_pickup_min = Math.ceil((distKm / 30) * 60);
    }

    // Actualizar oferta existente o crear nueva
    const existing = await this.tripOffersRepo.findOne({
      where: { trip_id: tripId, driver_id: driver.id, status: OfferStatus.PENDING },
    });

    let offerId: string;
    if (existing) {
      await this.tripOffersRepo.update(existing.id, {
        amount: offerAmount as any,
        eta_pickup_min,
        vehicle: vehicle ?? null,
      });
      offerId = existing.id;
    } else {
      const offer = await this.tripOffersRepo.save(
        this.tripOffersRepo.create({
          trip_id: tripId,
          driver,
          vehicle: vehicle ?? null,
          amount: offerAmount as any,
          eta_pickup_min,
        }),
      );
      offerId = offer.id;
    }

    // Calcular distancia en km al origen
    let distanceToOriginKm: number | null = null;
    if (driver.current_lat && driver.current_lng) {
      distanceToOriginKm = +this.fareService.haversineDistance(
        parseFloat(driver.current_lat as any), parseFloat(driver.current_lng as any),
        parseFloat(trip.origin_lat as any), parseFloat(trip.origin_lng as any),
      ).toFixed(2);
    }

    // Notificar al cliente con info completa del taxista
    this.logger.log(`[makeOffer] tripId=${tripId} driverId=${driver.id} clientId=${trip.client?.id ?? 'null'} amount=${offerAmount} isCounter=${dto.amount != null}`);
    if (trip.client) {
      const offerPayload = {
        trip_id:        tripId,
        offer_id:       offerId,
        driver_id:      driver.id,
        driver_name:    driver.full_name ?? null,
        driver_photo:   driver.profile_photo_url ?? null,
        driver_rating:  (driver as any).rating ? parseFloat((driver as any).rating) : null,
        vehicle_plate:  vehicle ? (vehicle as any).plate : null,
        vehicle_model:  vehicle ? `${(vehicle as any).brand ?? ''} ${(vehicle as any).model ?? ''}`.trim() : null,
        amount:         offerAmount,
        is_counter:     dto.amount != null,
        eta_pickup_min,
        distance_to_origin_km: distanceToOriginKm,
      };
      this.gateway.notifyUser(trip.client.id, 'trip.new_offer', offerPayload);
      this.notificationsService.sendToUser(trip.client.id, {
        title: `🚖 ${driver.full_name ?? 'Un taxista'} quiere llevarte`,
        body: `$${(offerAmount as number).toFixed(2)} · ${eta_pickup_min != null ? `${eta_pickup_min} min de distancia` : 'cerca de ti'}`,
        data: { trip_id: tripId, event: 'trip.new_offer' },
      });
    }

    return {
      message: `Oferta de $${offerAmount} enviada al cliente`,
      offer_id: offerId,
      amount: offerAmount,
      eta_pickup_min,
    };
  }

  // ── Cliente rechaza oferta de un conductor (flujo InDrive re-oferta) ─────────

  async rejectOffer(tripId: string, offerId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({ where: { id: tripId, client: { id: userId } } });
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const offer = await this.tripOffersRepo.findOne({
      where: { id: offerId, trip_id: tripId, status: OfferStatus.PENDING },
      relations: ['driver', 'driver.user'],
    });
    if (!offer) throw new NotFoundException('Oferta no encontrada o ya procesada');

    await this.tripOffersRepo.update(offerId, { status: OfferStatus.REJECTED });

    // Contar cuántas ofertas (de cualquier estado) ha hecho este conductor en este viaje
    const offerCount = await this.tripOffersRepo.count({
      where: { trip_id: tripId, driver_id: offer.driver_id },
    });

    const canReOffer = offerCount < 3;

    // Notificar al conductor: puede re-ofertar o ya alcanzó el límite
    if (offer.driver?.user) {
      this.gateway.notifyDriver(offer.driver.id, 'trip.offer_ignored', {
        trip_id:       tripId,
        offer_id:      offerId,
        can_re_offer:  canReOffer,
        offers_made:   offerCount,
        max_offers:    3,
      });
    }

    return { ok: true, can_re_offer: canReOffer };
  }

  // ── Listar ofertas del viaje (cliente) ───────────────────────────────────────

  async getOffers(tripId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const offers = await this.tripOffersRepo.find({
      where: { trip_id: tripId, status: OfferStatus.PENDING },
      relations: ['driver', 'driver.user', 'vehicle'],
      order: { amount: 'ASC', eta_pickup_min: 'ASC', created_at: 'ASC' },
    });

    const clientPrice = parseFloat(trip.client_offer as any) ?? parseFloat(trip.suggested_fare as any);

    const originLat = parseFloat(trip.origin_lat as any);
    const originLng = parseFloat(trip.origin_lng as any);

    return offers.map((o) => {
      const driverLat = (o.driver as any).current_lat;
      const driverLng = (o.driver as any).current_lng;
      const distanceKm =
        driverLat != null && driverLng != null && !isNaN(originLat) && !isNaN(originLng)
          ? this.fareService.haversineDistance(originLat, originLng, parseFloat(driverLat), parseFloat(driverLng))
          : null;

      return {
        offer_id: o.id,
        driver: {
          id:     o.driver.id,
          name:   (o.driver as any).full_name         ?? null,
          photo:  (o.driver as any).profile_photo_url ?? null,
          rating: (o.driver as any).rating ? parseFloat((o.driver as any).rating) : null,
        },
        vehicle: o.vehicle
          ? { plate: (o.vehicle as any).plate, model: (o.vehicle as any).model }
          : null,
        amount:              o.amount != null ? parseFloat(o.amount as any) : clientPrice,
        is_counter:          o.amount != null && parseFloat(o.amount as any) !== clientPrice,
        eta_pickup_min:      o.eta_pickup_min,
        distance_to_origin_km: distanceKm,
        created_at:          o.created_at,
      };
    });
  }

  // ── Cliente selecciona una oferta ────────────────────────────────────────────

  async selectOffer(tripId: string, offerId: string, userId: string) {
    this.logger.log(`[selectOffer] tripId=${tripId} offerId=${offerId} userId=${userId}`);
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.fare_mode !== FareMode.NEGOTIATED) {
      throw new BadRequestException('Solo aplica a viajes de precio fijo');
    }
    if (trip.status !== TripStatus.REQUESTED) {
      throw new ConflictException('El viaje ya fue asignado');
    }

    // Ejecutar toda la lógica DB en una transacción y extraer los datos necesarios
    // para notificar DESPUÉS del COMMIT — garantiza que el driver ya verá el viaje asignado
    const {
      selectedDriverId,
      rejectedDriverIds,
      agreedFare,
      otpCode,
    } = await this.dataSource.transaction(async (em) => {
      // Lock pesimista para evitar doble selección simultánea
      const lockedTrip = await em.findOne(Trip, {
        where: { id: tripId },
        lock: { mode: 'pessimistic_write' },
      });
      if (lockedTrip!.status !== TripStatus.REQUESTED) {
        throw new ConflictException('El viaje ya fue asignado por otra acción concurrente');
      }

      const selectedOffer = await em.findOne(TripOffer, {
        where: { id: offerId, trip_id: tripId, status: OfferStatus.PENDING },
        relations: ['driver', 'driver.user', 'vehicle', 'vehicle.cooperative'],
      });
      if (!selectedOffer) throw new NotFoundException('Oferta no encontrada o ya procesada');

      // Verificar que el conductor seleccionado no tenga ya un viaje activo
      const driverBusy = await em.findOne(Trip, {
        where: {
          driver: { id: selectedOffer.driver.id },
          status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
        },
      });
      if (driverBusy) throw new ConflictException('El conductor ya tiene un viaje activo en este momento');

      const clientPrice = parseFloat(lockedTrip!.client_offer as any)
        ?? parseFloat(lockedTrip!.suggested_fare as any);
      const fare = selectedOffer.amount != null
        ? parseFloat(selectedOffer.amount as any)
        : clientPrice;

      const otp = generateOtp();

      // Resolver cooperativa del conductor (vehicle > membership)
      let driverCoopId: string | undefined = (selectedOffer.vehicle as any)?.cooperative?.id;
      if (!driverCoopId) {
        const membership = await em.findOne(CooperativeMember, {
          where: { user: { id: selectedOffer.driver.user.id } },
          relations: ['cooperative'],
        });
        driverCoopId = membership?.cooperative?.id;
      }

      // Asignar conductor y marcar ACCEPTED
      await em.update(Trip, tripId, {
        status: TripStatus.ACCEPTED,
        driver: { id: selectedOffer.driver.id },
        vehicle: selectedOffer.vehicle ? { id: (selectedOffer.vehicle as any).id } : undefined,
        agreed_fare: fare as any,
        accepted_at: new Date(),
        otp_code: otp,
        ...(driverCoopId && { cooperative: { id: driverCoopId } }),
      });

      // Marcar oferta seleccionada
      await em.update(TripOffer, offerId, { status: OfferStatus.SELECTED });

      // Rechazar todas las demás ofertas pendientes de este viaje
      await em.createQueryBuilder()
        .update(TripOffer)
        .set({ status: OfferStatus.REJECTED })
        .where('trip_id = :tripId AND id != :offerId AND status = :status', {
          tripId, offerId, status: OfferStatus.PENDING,
        })
        .execute();

      // Cancelar otras ofertas pendientes del mismo conductor en otros viajes
      await em.createQueryBuilder()
        .update(TripOffer)
        .set({ status: OfferStatus.REJECTED })
        .where('driver_id = :driverId AND trip_id != :tripId AND status = :status', {
          driverId: selectedOffer.driver.id, tripId, status: OfferStatus.PENDING,
        })
        .execute();

      // Marcar conductor como BUSY
      await em.update(Driver, selectedOffer.driver.id, { online_status: DriverOnlineStatus.BUSY });

      // Auto-checkout de parada si el conductor estaba en cola
      await this.standAssignmentsRepo
        .createQueryBuilder()
        .update()
        .set({ checked_out_at: new Date() })
        .where('driver_id = :driverId AND checked_out_at IS NULL', { driverId: selectedOffer.driver.id })
        .execute();

      // Recopilar IDs de conductores rechazados para notificar fuera de la tx
      const rejectedOffers = await em.createQueryBuilder(TripOffer, 'o')
        .leftJoinAndSelect('o.driver', 'driver')
        .where('o.trip_id = :tripId AND o.id != :offerId AND o.status = :status', {
          tripId, offerId, status: OfferStatus.REJECTED,
        })
        .getMany();

      return {
        selectedDriverId: selectedOffer.driver.id,
        rejectedDriverIds: rejectedOffers.map(ro => ro.driver?.id).filter(Boolean) as string[],
        agreedFare: fare,
        otpCode: otp,
      };
    });

    // ── Notificaciones fuera de la transacción — el COMMIT ya es visible ──────
    const fareConfig = await this.fareService.getConfig();

    this.logger.log(`[selectOffer] notifyDriver driverId=${selectedDriverId} trip_id=${tripId}`);
    this.gateway.notifyDriver(selectedDriverId, 'trip.offer_accepted', {
      trip_id: tripId,
      agreed_fare: agreedFare,
      location_update_interval_sec: fareConfig.location_interval_trip_sec,
    });

    for (const driverId of rejectedDriverIds) {
      this.gateway.notifyDriver(driverId, 'trip.offer_rejected', { trip_id: tripId });
    }

    // Notificar al cliente con OTP (solo él lo ve)
    this.gateway.notifyUser(userId, 'trip.accepted', {
      trip_id: tripId,
      driver_id: selectedDriverId,
      status: TripStatus.ACCEPTED,
      agreed_fare: agreedFare,
      otp_code: otpCode,
      location_update_interval_sec: fareConfig.location_interval_trip_sec,
    });

    return {
      message: `Conductor asignado. Tarifa acordada: $${agreedFare}`,
      trip_id: tripId,
      agreed_fare: agreedFare,
    };
  }

  // ── Incrementar oferta del cliente ($0.25) ────────────────────────────────────

  async incrementOffer(tripId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
      relations: ['client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.fare_mode !== FareMode.NEGOTIATED) {
      throw new BadRequestException('Solo aplica a viajes de precio fijo');
    }
    if (trip.status !== TripStatus.REQUESTED) {
      throw new BadRequestException('No se puede modificar la oferta en este estado');
    }

    const pendingCount = await this.tripOffersRepo.count({
      where: { trip_id: tripId, status: OfferStatus.PENDING },
    });
    if (pendingCount > 0) {
      throw new BadRequestException('Tienes ofertas de conductores pendientes. Selecciona una.');
    }

    const currentOffer = parseFloat(trip.client_offer as any) ?? parseFloat(trip.suggested_fare as any);
    const newOffer = +(currentOffer + 0.25).toFixed(2);

    await this.tripsRepo.update(tripId, { client_offer: newOffer as any });

    const clientProfile = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    const originLat  = parseFloat(trip.origin_lat as any);
    const originLng  = parseFloat(trip.origin_lng as any);
    // current_search_radius_km es null antes de la primera expansión → fallback a 1.0
    const searchKm   = parseFloat(trip.current_search_radius_km as any) || 1.0;

    const pricePayload = {
      trip_id:             tripId,
      new_price:           newOffer,
      client_offer:        newOffer,
      origin_address:      trip.origin_address,
      destination_address: trip.destination_address,
      origin_lat:          originLat,
      origin_lng:          originLng,
      search_radius_km:    searchKm,
      suggested_fare:      parseFloat(trip.suggested_fare as any),
      fare_mode:           trip.fare_mode,
      distance_km:         parseFloat(trip.estimated_distance_km as any),
      client_name:         clientProfile?.full_name ?? (trip.client as any)?.full_name ?? null,
      client_rating:       clientProfile ? parseFloat(clientProfile.rating as any) : null,
      client_total_trips:  clientProfile?.total_trips ?? 0,
    };

    this.gateway.notifyAvailableDrivers('trip.price_updated', pricePayload);
    this.gateway.sendPriceUpdateFcm(tripId, newOffer, originLat, originLng, searchKm,
      trip.origin_address ?? 'Origen', trip.destination_address ?? 'Destino')
      .catch(err => this.logger.warn(`FCM price update failed: ${err.message}`));

    return { message: `Oferta actualizada a $${newOffer}`, client_offer: newOffer };
  }

  async setOffer(tripId: string, userId: string, amount: number) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
      relations: ['client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.fare_mode !== FareMode.NEGOTIATED)
      throw new BadRequestException('Solo aplica a viajes de precio negociado');
    if (trip.status !== TripStatus.REQUESTED)
      throw new BadRequestException('No se puede modificar la oferta en este estado');

    const pendingCount = await this.tripOffersRepo.count({
      where: { trip_id: tripId, status: OfferStatus.PENDING },
    });
    if (pendingCount > 0)
      throw new BadRequestException('Tienes ofertas de conductores pendientes. Selecciona una.');

    const suggestedFare = parseFloat(trip.suggested_fare as any);
    const fareConfig    = await this.fareService.getConfig();
    const discountPct   = parseFloat(fareConfig.max_negotiation_discount_pct as any);
    const rawMin        = suggestedFare * (1 - discountPct / 100);
    const roundedMin    = Math.ceil(rawMin / 0.05) * 0.05;
    const minimumFare   = +Math.max(roundedMin, 1.50).toFixed(2);

    const newOffer = +amount.toFixed(2);
    if (newOffer < minimumFare)
      throw new BadRequestException(`La oferta mínima es $${minimumFare.toFixed(2)}`);

    await this.tripsRepo.update(tripId, { client_offer: newOffer as any });

    const clientProfile = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    const originLat     = parseFloat(trip.origin_lat as any);
    const originLng     = parseFloat(trip.origin_lng as any);
    const searchKm      = parseFloat(trip.current_search_radius_km as any) || 1.0;

    const payload = {
      trip_id:             tripId,
      new_price:           newOffer,
      client_offer:        newOffer,
      origin_address:      trip.origin_address,
      destination_address: trip.destination_address,
      origin_lat:          originLat,
      origin_lng:          originLng,
      search_radius_km:    searchKm,
      suggested_fare:      suggestedFare,
      fare_mode:           trip.fare_mode,
      distance_km:         parseFloat(trip.estimated_distance_km as any),
      client_name:         clientProfile?.full_name ?? (trip.client as any)?.full_name ?? null,
      client_rating:       clientProfile ? parseFloat(clientProfile.rating as any) : null,
      client_total_trips:  clientProfile?.total_trips ?? 0,
    };

    this.gateway.notifyAvailableDrivers('trip.price_updated', payload);
    this.gateway.sendPriceUpdateFcm(tripId, newOffer, originLat, originLng, searchKm,
      trip.origin_address ?? 'Origen', trip.destination_address ?? 'Destino')
      .catch(err => this.logger.warn(`FCM setOffer failed: ${err.message}`));

    return { message: `Oferta actualizada a $${newOffer}`, client_offer: newOffer };
  }

  async decrementOffer(tripId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
      relations: ['client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.fare_mode !== FareMode.NEGOTIATED)
      throw new BadRequestException('Solo aplica a viajes de precio fijo');
    if (trip.status !== TripStatus.REQUESTED)
      throw new BadRequestException('No se puede modificar la oferta en este estado');

    const pendingCount = await this.tripOffersRepo.count({
      where: { trip_id: tripId, status: OfferStatus.PENDING },
    });
    if (pendingCount > 0)
      throw new BadRequestException('Tienes ofertas pendientes. Selecciona una.');

    const currentOffer  = parseFloat(trip.client_offer as any);
    const suggestedFare = parseFloat(trip.suggested_fare as any);

    const fareConfig   = await this.fareService.getConfig();
    const discountPct  = parseFloat(fareConfig.max_negotiation_discount_pct as any);
    const rawMin       = suggestedFare * (1 - discountPct / 100);
    const roundedMin   = Math.ceil(rawMin / 0.05) * 0.05;
    const minimumFare  = +Math.max(roundedMin, 1.50).toFixed(2);

    const newOffer = +(currentOffer - 0.25).toFixed(2);

    if (newOffer < minimumFare)
      throw new BadRequestException(`La oferta mínima es $${minimumFare.toFixed(2)}`);

    await this.tripsRepo.update(tripId, { client_offer: newOffer as any });

    const clientProfileDecr = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    const originLatDecr  = parseFloat(trip.origin_lat as any);
    const originLngDecr  = parseFloat(trip.origin_lng as any);
    const searchKmDecr   = parseFloat(trip.current_search_radius_km as any) || 1.0;

    const decrPayload = {
      trip_id:             tripId,
      new_price:           newOffer,
      client_offer:        newOffer,
      origin_address:      trip.origin_address,
      destination_address: trip.destination_address,
      origin_lat:          originLatDecr,
      origin_lng:          originLngDecr,
      search_radius_km:    searchKmDecr,
      suggested_fare:      parseFloat(trip.suggested_fare as any),
      fare_mode:           trip.fare_mode,
      distance_km:         parseFloat(trip.estimated_distance_km as any),
      client_name:         clientProfileDecr?.full_name ?? (trip.client as any)?.full_name ?? null,
      client_rating:       clientProfileDecr ? parseFloat(clientProfileDecr.rating as any) : null,
      client_total_trips:  clientProfileDecr?.total_trips ?? 0,
    };

    this.gateway.notifyAvailableDrivers('trip.price_updated', decrPayload);
    this.gateway.sendPriceUpdateFcm(tripId, newOffer, originLatDecr, originLngDecr, searchKmDecr,
      trip.origin_address ?? 'Origen', trip.destination_address ?? 'Destino')
      .catch(err => this.logger.warn(`FCM price update failed: ${err.message}`));

    return { message: `Oferta actualizada a $${newOffer}`, client_offer: newOffer };
  }

  // ── Conductor marca llegada al punto de recogida ─────────────────────────────

  async driverArrived(tripId: string, userId: string) {
    const driver = await this.findDriverByUser(userId);

    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, driver: { id: driver.id } },
      relations: ['client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado o no te pertenece');
    if (trip.status !== TripStatus.ACCEPTED) {
      throw new BadRequestException('El viaje debe estar aceptado para marcar llegada');
    }

    const waitExpires = new Date(Date.now() + 5 * 60 * 1000);

    await this.tripsRepo.update(tripId, {
      status: TripStatus.DRIVER_ARRIVED,
      driver_arrived_at: new Date(),
      wait_timer_expires_at: waitExpires,
    });

    // Enviar OTP solo al cliente
    if (trip.client) {
      this.gateway.notifyUser(trip.client.id, 'trip.driver_arrived', {
        trip_id: tripId,
        driver_id: driver.id,
        wait_expires_at: waitExpires.toISOString(),
        otp_code: trip.otp_code,
      });
      this.notificationsService.sendToUser(trip.client.id, {
        title: '¡Tu taxi llegó!',
        body: 'Tu conductor está esperando. Tienes 5 minutos. Abre la app para ver el código.',
        data: { trip_id: tripId, event: 'trip.driver_arrived' },
      });
    }

    // Notificación general de sala (sin OTP)
    this.gateway.notifyTripUpdate(tripId, 'trip.driver_arrived', {
      trip_id: tripId,
      driver_id: driver.id,
      driver_arrived_at: new Date().toISOString(),
      wait_expires_at: waitExpires.toISOString(),
    });

    return {
      message: 'Llegada marcada. Esperando al pasajero (5 min).',
      wait_expires_at: waitExpires,
    };
  }

  // ── Cliente confirma que va en camino ────────────────────────────────────────

  async clientReady(tripId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
      relations: ['driver', 'driver.user'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.status !== TripStatus.DRIVER_ARRIVED) {
      throw new BadRequestException('El conductor aún no ha marcado su llegada');
    }

    await this.tripsRepo.update(tripId, { client_confirmed_at: new Date() });

    if (trip.driver?.user) {
      this.gateway.notifyDriver(trip.driver.id, 'trip.client_ready', {
        trip_id: tripId,
        confirmed_at: new Date().toISOString(),
      });
    }

    return { message: 'Tu conductor ha sido notificado. ¡Vamos!' };
  }

  // ── Iniciar viaje (requiere OTP) ─────────────────────────────────────────────

  async startTrip(tripId: string, userId: string, dto: StartTripDto) {
    const driver = await this.findDriverByUser(userId);
    const trip = await this.findTripForDriver(tripId, driver.id);

    if (![TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED].includes(trip.status)) {
      throw new BadRequestException('El viaje debe estar aceptado para iniciarse');
    }

    const otpBypass = process.env.NODE_ENV !== 'production' && dto.otp_code === '000000';
    if (trip.otp_code && !otpBypass && trip.otp_code !== dto.otp_code) {
      throw new BadRequestException('Código OTP incorrecto. Pide al pasajero su código.');
    }

    const fareConfig = await this.fareService.getConfig();
    const baseFare = parseFloat(fareConfig.base_fare as any);

    await this.tripsRepo.update(tripId, {
      status: TripStatus.IN_PROGRESS,
      started_at: new Date(),
      meter_amount: baseFare as any,
      otp_code: null, // limpiar OTP tras verificación exitosa
    });

    this.gateway.notifyTripUpdate(tripId, 'trip.started', {
      trip_id: tripId,
      status: TripStatus.IN_PROGRESS,
      meter_amount: baseFare,
    });
    return { message: 'Viaje iniciado. Buen camino.' };
  }

  // ── Completar viaje ──────────────────────────────────────────────────────────

  async completeTrip(tripId: string, userId: string, dto: CompleteTripDto) {
    const driver = await this.findDriverByUser(userId);
    const trip = await this.findTripForDriver(tripId, driver.id);

    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException('El viaje debe estar EN_PROGRESO para completarse');
    }

    let fare: number;
    if (trip.fare_mode === FareMode.NEGOTIATED && trip.agreed_fare) {
      fare = parseFloat(trip.agreed_fare as any);
    } else if (trip.fare_mode === FareMode.METER) {
      const meterAmount = parseFloat(trip.meter_amount as any) || 0;
      fare = meterAmount > 0 ? meterAmount : dto.fare_amount;
    } else {
      fare = dto.fare_amount;
    }

    if (isNaN(fare) || fare <= 0) throw new BadRequestException('Tarifa inválida');

    const fareConfig = await this.fareService.getConfig();
    const minimumFare = parseFloat(fareConfig.minimum_fare as any);
    if (fare < minimumFare) fare = minimumFare;

    const commissionRate = parseFloat(trip.commission_rate);
    const commissionAmount = +(fare * commissionRate).toFixed(2);

    const wallet = await this.walletRepo.findOne({ where: { driver: { id: driver.id } } });
    if (!wallet) throw new NotFoundException('Wallet del conductor no encontrada');

    await this.dataSource.transaction(async (em) => {
      await em.update(Trip, tripId, {
        status: TripStatus.COMPLETED,
        fare_amount: fare.toFixed(2) as any,
        commission_amount: commissionAmount.toFixed(2) as any,
        completed_at: new Date(),
      });
      await this.walletService.deductCommission(wallet.id, commissionAmount, tripId, em);
      if (trip.cooperative?.id) {
        await this.accountingService.creditCoopCommission(trip.cooperative.id, commissionAmount, tripId, em);
      }
      await em.update(Driver, driver.id, { online_status: DriverOnlineStatus.ONLINE });
    });

    const result = {
      message: 'Viaje completado.',
      fare_amount: fare.toFixed(2),
      commission_amount: commissionAmount.toFixed(2),
    };

    this.gateway.notifyTripUpdate(tripId, 'trip.completed', {
      trip_id: tripId,
      status: TripStatus.COMPLETED,
      location_update_interval_sec: fareConfig.location_interval_fleet_sec,
      ...result,
    });

    return result;
  }

  // ── Cancelar viaje ───────────────────────────────────────────────────────────

  async cancelTrip(tripId: string, user: User, dto: CancelTripDto) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId },
      relations: ['client', 'driver', 'driver.user', 'cooperative'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    if (user.role === UserRole.CLIENT && trip.client?.id !== user.id)
      throw new ForbiddenException('No eres el cliente de este viaje');
    if (user.role === UserRole.DRIVER && trip.driver?.user?.id !== user.id)
      throw new ForbiddenException('No eres el conductor de este viaje');

    if ([TripStatus.COMPLETED, TripStatus.CANCELLED].includes(trip.status)) {
      throw new BadRequestException('El viaje ya está finalizado');
    }

    const cancelledBy = this.resolveCancelledBy(user, trip);

    if (
      [CancelledBy.DRIVER, CancelledBy.CLIENT].includes(cancelledBy) &&
      trip.status === TripStatus.IN_PROGRESS
    ) {
      throw new ForbiddenException('No puedes cancelar un viaje que ya está en progreso');
    }

    await this.dataSource.transaction(async (em) => {
      await em.update(Trip, tripId, {
        status: TripStatus.CANCELLED,
        cancelled_by: cancelledBy,
        cancellation_reason: dto.reason ?? null,
        cancelled_at: new Date(),
      });

      if (trip.driver && [TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS].includes(trip.status)) {
        await em.update(Driver, trip.driver.id, { online_status: DriverOnlineStatus.ONLINE });
      }

      // Expirar ofertas pendientes si el viaje era negociado
      if (trip.fare_mode === FareMode.NEGOTIATED) {
        await em.createQueryBuilder()
          .update(TripOffer)
          .set({ status: OfferStatus.EXPIRED })
          .where('trip_id = :tripId AND status = :status', { tripId, status: OfferStatus.PENDING })
          .execute();
      }
    });

    this.gateway.notifyTripUpdate(tripId, 'trip.cancelled', {
      trip_id: tripId,
      status: TripStatus.CANCELLED,
      cancelled_by: cancelledBy,
      reason: dto.reason,
    });

    return { message: 'Viaje cancelado' };
  }

  // ── Historial ────────────────────────────────────────────────────────────────

  async getMyTripsAsClient(userId: string, page = 1, limit = 20) {
    const [rawItems, total] = await this.tripsRepo.findAndCount({
      where: { client: { id: userId } },
      relations: ['driver', 'vehicle'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const pf = (v: any) => (v != null ? parseFloat(v) : null);
    const items = rawItems.map((t) => ({
      id: t.id,
      status: t.status,
      fare_mode: t.fare_mode,
      source: t.source,
      origin_address: t.origin_address,
      origin_lat: pf(t.origin_lat),
      origin_lng: pf(t.origin_lng),
      destination_address: t.destination_address,
      estimated_distance_km: pf(t.estimated_distance_km),
      estimated_duration_min: t.estimated_duration_min ?? null,
      suggested_fare: pf(t.suggested_fare),
      client_offer: pf(t.client_offer),
      fare_amount: pf(t.fare_amount),
      payment_status: t.payment_status,
      cancelled_by: t.cancelled_by ?? null,
      cancellation_reason: t.cancellation_reason ?? null,
      driver: t.driver
        ? { id: (t.driver as any).id, full_name: (t.driver as any).full_name ?? null }
        : null,
      vehicle: t.vehicle
        ? { plate: (t.vehicle as any).plate ?? null, model: (t.vehicle as any).model ?? null }
        : null,
      created_at: t.created_at,
    }));
    return { items, total, page, limit };
  }

  async getActiveTrip(userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: {
        client: { id: userId },
        status: In([
          TripStatus.REQUESTED,
          TripStatus.ACCEPTED,
          TripStatus.DRIVER_ARRIVED,
          TripStatus.IN_PROGRESS,
        ]),
      },
      relations: ['driver', 'vehicle', 'offers'],
    });
    if (!trip) return null;

    const pendingOffer = trip.offers
      ?.filter(o => o.status === OfferStatus.PENDING)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    // Excluir `offers` del spread — cada offer tiene `trip` de vuelta (referencia circular)
    const { offers: _offers, ...tripData } = trip as any;
    return {
      ...tripData,
      pending_offer_amount: pendingOffer ? parseFloat(pendingOffer.amount as any) : null,
    };
  }

  async getMyTripsAsDriver(userId: string, page = 1, limit = 20) {
    const driver = await this.findDriverByUser(userId);
    const [items, total] = await this.tripsRepo.findAndCount({
      where: { driver: { id: driver.id } },
      relations: ['client', 'vehicle', 'cooperative'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getActiveTripAsDriver(userId: string) {
    const driver = await this.findDriverByUser(userId);
    const trip = await this.tripsRepo.findOne({
      where: {
        driver: { id: driver.id },
        status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
      },
      relations: ['client', 'vehicle', 'cooperative'],
    });
    if (!trip) return null;
    // El conductor nunca debe ver el OTP — se lo da el cliente en persona
    const { otp_code: _otp, ...safe } = trip as any;
    return safe;
  }

  async listTrips(user: User, status?: TripStatus, page = 1, limit = 20) {
    const COOP_ROLES_LOCAL = [
      UserRole.COOPERATIVE_ADMIN,
      UserRole.COOPERATIVE_OPERATOR,
      UserRole.COOPERATIVE_SUPERVISOR,
    ];

    const qb = this.tripsRepo
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.client', 'client')
      .leftJoinAndSelect('trip.driver', 'driver')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.cooperative', 'cooperative')
      .orderBy('trip.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('trip.status = :status', { status });

    if (COOP_ROLES_LOCAL.includes(user.role)) {
      // Fuerza filtro por la cooperativa del JWT — nunca confiar en query params
      if (!user.cooperative_id) throw new ForbiddenException('No estás asociado a ninguna cooperativa');
      // Triple OR para cubrir todos los casos:
      // 1. trip.cooperative_id: viajes creados por la coop o aceptados post-fix
      // 2. vehicleCoop: vehículo del viaje pertenece a la coop
      // 3. driverMember: el conductor asignado es miembro de la coop (históricos sin cooperative_id)
      qb.leftJoin('vehicle.cooperative', 'vehicleCoop')
        .leftJoin('driver.user', 'driverUser')
        .leftJoin(CooperativeMember, 'driverMember', 'driverMember.user_id = driverUser.id');
      qb.andWhere(
        '(trip.cooperative_id = :coopId OR vehicleCoop.id = :coopId OR driverMember.cooperative_id = :coopId)',
        { coopId: user.cooperative_id },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getTripById(id: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id },
      relations: ['client', 'driver', 'vehicle', 'cooperative'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip;
  }

  // Llamado desde EventsGateway cuando el conductor envía location.update durante un viaje
  async updateTripMeter(tripId: string, distanceKm: number, durationMin: number, speedKmh: number) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, status: TripStatus.IN_PROGRESS, fare_mode: FareMode.METER },
      relations: ['cooperative'],
    });
    if (!trip) return;

    const config = await this.fareService.getConfig();
    const newAmount = this.fareService.updateMeter(
      parseFloat(trip.meter_amount as any) || 0,
      distanceKm,
      durationMin,
      speedKmh,
      config,
    );

    await this.tripsRepo.update(tripId, { meter_amount: newAmount as any });
    this.gateway.notifyTripUpdate(tripId, 'trip.meter_update', {
      trip_id: tripId,
      meter_amount: newAmount,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async resolveCommissionRate(coopOverridePct: number | null): Promise<number> {
    if (coopOverridePct != null) {
      return parseFloat(coopOverridePct as any) / 100;
    }
    const config = await this.configRepo.findOne({ where: { key: 'commission_rate' } });
    const rawPct = config ? parseFloat(config.value) : NaN;
    const pct = isNaN(rawPct) ? DEFAULT_COMMISSION_RATE_PCT : rawPct;
    return pct / 100;
  }

  private async findDriverByUser(userId: string): Promise<Driver> {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');
    return driver;
  }

  private async findTripForDriver(tripId: string, driverId: string): Promise<Trip> {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, driver: { id: driverId } },
      relations: ['cooperative'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado o no te pertenece');
    return trip;
  }

  private async findDriverVehicle(driverId: string, trip: Trip): Promise<Vehicle | null> {
    const driver = await this.driversService.getCachedDriverWithVehicle(driverId);
    const vehicle = driver?.active_vehicle;
    if (!vehicle || vehicle.approval_status !== VehicleApprovalStatus.APPROVED) return null;
    if (trip.cooperative && vehicle.cooperative?.id !== trip.cooperative.id) return null;
    return vehicle;
  }

  private resolveCancelledBy(user: User, trip: Trip): CancelledBy {
    if (user.role === UserRole.CLIENT) return CancelledBy.CLIENT;
    if (user.role === UserRole.DRIVER) return CancelledBy.DRIVER;
    if ([UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR].includes(user.role)) {
      return CancelledBy.COOPERATIVE;
    }
    return CancelledBy.PLATFORM;
  }
}
