import {
  Injectable,
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

const DEFAULT_COMMISSION_RATE_PCT = 10;

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

@Injectable()
export class TripsService {
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
    private notificationsService: NotificationsService,
    private accountingService: AccountingService,
  ) {}

  // ── Crear viaje ──────────────────────────────────────────────────────────────

  async createTrip(user: User, dto: CreateTripDto): Promise<Trip> {
    const fareMode = dto.fare_mode ?? FareMode.METER;

    if (user.role === UserRole.CLIENT) {
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

      this.gateway.notifyNewTrip({
        trip_id: trip.id,
        origin_address: trip.origin_address,
        destination_address: trip.destination_address,
        suggested_fare: estimate.total,
        fare_mode: fareMode,
        client_offer: trip.client_offer,
        distance_km: estimate.distance_km,
        duration_min: estimate.duration_min,
        is_night_rate: estimate.is_night_rate,
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
        this.gateway.notifyDriver(firstInQueue.driver.user.id, 'trip.new', {
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

    if (driver.current_lat && driver.current_lng) {
      const fareConfig = await this.fareService.getConfig();
      const defaultRadius = parseFloat(fareConfig.search_radius_km as any);

      return trips.filter((trip) => {
        const tripRadius =
          trip.current_search_radius_km != null
            ? parseFloat(trip.current_search_radius_km as any)
            : defaultRadius;

        const dist = this.fareService.haversineDistance(
          parseFloat(driver.current_lat as any),
          parseFloat(driver.current_lng as any),
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
      this.gateway.notifyDriver(driver.user.id, 'trip.accepted', basePayload);
      this.gateway.notifyTripUpdate(tripId, 'trip.accepted', basePayload);

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

    const offerAmount = dto.amount ?? clientPrice;
    const vehicle = await this.findDriverVehicle(driver.id, trip);

    // ETA del conductor al punto de recogida
    let eta_pickup_min: number | null = null;
    if (driver.current_lat && driver.current_lng) {
      try {
        const eta = await this.fareService.getRouteInfo(
          parseFloat(driver.current_lat as any), parseFloat(driver.current_lng as any),
          parseFloat(trip.origin_lat as any), parseFloat(trip.origin_lng as any),
        );
        eta_pickup_min = eta.duration_min;
      } catch { /* sin ETA si falla Mapbox */ }
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

    // Notificar al cliente
    if (trip.client) {
      this.gateway.notifyUser(trip.client.id, 'trip.new_offer', {
        trip_id: tripId,
        offer_id: offerId,
        driver_id: driver.id,
        amount: offerAmount,
        eta_pickup_min,
      });
    }

    return {
      message: `Oferta de $${offerAmount} enviada al cliente`,
      offer_id: offerId,
      amount: offerAmount,
      eta_pickup_min,
    };
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

    return offers.map((o) => ({
      offer_id: o.id,
      driver: {
        id: o.driver.id,
        name: (o.driver as any).full_name ?? null,
      },
      vehicle: o.vehicle
        ? { plate: (o.vehicle as any).plate, model: (o.vehicle as any).model }
        : null,
      amount: o.amount != null ? parseFloat(o.amount as any) : clientPrice,
      eta_pickup_min: o.eta_pickup_min,
      created_at: o.created_at,
    }));
  }

  // ── Cliente selecciona una oferta ────────────────────────────────────────────

  async selectOffer(tripId: string, offerId: string, userId: string) {
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

    return this.dataSource.transaction(async (em) => {
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
        relations: ['driver', 'driver.user', 'vehicle'],
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
      const agreedFare = selectedOffer.amount != null
        ? parseFloat(selectedOffer.amount as any)
        : clientPrice;

      const otpCode = generateOtp();

      // Asignar conductor y marcar ACCEPTED
      await em.update(Trip, tripId, {
        status: TripStatus.ACCEPTED,
        driver: { id: selectedOffer.driver.id },
        vehicle: selectedOffer.vehicle ? { id: (selectedOffer.vehicle as any).id } : undefined,
        agreed_fare: agreedFare as any,
        accepted_at: new Date(),
        otp_code: otpCode,
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

      const fareConfig = await this.fareService.getConfig();

      // Notificar al conductor seleccionado
      this.gateway.notifyDriver(selectedOffer.driver.user.id, 'trip.offer_accepted', {
        trip_id: tripId,
        agreed_fare: agreedFare,
        location_update_interval_sec: fareConfig.location_interval_trip_sec,
      });

      // Notificar a los conductores rechazados (obtenemos la lista antes del update, pero ya están rechazados)
      const rejectedOffers = await em.createQueryBuilder(TripOffer, 'o')
        .leftJoinAndSelect('o.driver', 'driver')
        .leftJoinAndSelect('driver.user', 'user')
        .where('o.trip_id = :tripId AND o.id != :offerId AND o.status = :status', {
          tripId, offerId, status: OfferStatus.REJECTED,
        })
        .getMany();

      for (const ro of rejectedOffers) {
        if (ro.driver?.user) {
          this.gateway.notifyDriver(ro.driver.user.id, 'trip.offer_rejected', { trip_id: tripId });
        }
      }

      // Notificar al cliente con OTP (solo él lo ve)
      this.gateway.notifyUser(userId, 'trip.accepted', {
        trip_id: tripId,
        driver_id: selectedOffer.driver.id,
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
    });
  }

  // ── Incrementar oferta del cliente ($0.25) ────────────────────────────────────

  async incrementOffer(tripId: string, userId: string) {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId, client: { id: userId } },
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

    // Notificar a conductores disponibles que la oferta subió
    this.gateway.notifyNewTrip({ trip_id: tripId, client_offer: newOffer, event: 'offer_updated' });

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
        body: `Tu conductor está esperando. Tienes 5 minutos. Código: ${trip.otp_code}`,
        data: { trip_id: tripId, event: 'trip.driver_arrived', otp_code: trip.otp_code ?? '' },
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
      this.gateway.notifyDriver(trip.driver.user.id, 'trip.client_ready', {
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

    // Verificación OTP — en dev, '000000' bypasa la verificación
    if (trip.otp_code) {
      const isDev = process.env.NODE_ENV !== 'production';
      const isBypass = isDev && dto.otp_code === '000000';
      if (!isBypass && trip.otp_code !== dto.otp_code) {
        throw new BadRequestException('Código OTP incorrecto. Pide al pasajero su código.');
      }
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

    const fleetConfig = await this.fareService.getConfig();
    this.gateway.notifyTripUpdate(tripId, 'trip.cancelled', {
      trip_id: tripId,
      status: TripStatus.CANCELLED,
      cancelled_by: cancelledBy,
      reason: dto.reason,
      location_update_interval_sec: fleetConfig.location_interval_fleet_sec,
    });

    return { message: 'Viaje cancelado' };
  }

  // ── Historial ────────────────────────────────────────────────────────────────

  async getMyTripsAsClient(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.tripsRepo.findAndCount({
      where: { client: { id: userId } },
      relations: ['driver', 'vehicle'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getActiveTrip(userId: string) {
    return this.tripsRepo.findOne({
      where: {
        client: { id: userId },
        status: In([
          TripStatus.REQUESTED,
          TripStatus.ACCEPTED,
          TripStatus.DRIVER_ARRIVED,
          TripStatus.IN_PROGRESS,
        ]),
      },
      relations: ['driver', 'vehicle'],
    });
    // otp_code se incluye — cliente necesita verlo para dárselo al conductor
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

  async listTrips(status?: TripStatus, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [items, total] = await this.tripsRepo.findAndCount({
      where,
      relations: ['client', 'driver', 'vehicle', 'cooperative'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
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
    const pct = config ? parseFloat(config.value) : DEFAULT_COMMISSION_RATE_PCT;
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
