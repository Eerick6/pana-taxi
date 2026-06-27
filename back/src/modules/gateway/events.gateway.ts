import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Driver, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Trip, TripStatus, FareMode } from '../trips/entities/trip.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { FareService, GeoJsonLineString } from '../fare/fare.service';

export const ROOM = {
  driver: (id: string) => `driver:${id}`,
  user: (id: string) => `user:${id}`,
  trip: (id: string) => `trip:${id}`,
  coop: (id: string) => `coop:${id}`,
  platform: 'platform',
  available: 'available_drivers',
};

@Injectable()
@WebSocketGateway({
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*', credentials: true },
  namespace: '/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private socketUsers = new Map<string, string>(); // socketId → userId
  private userSockets = new Map<string, string>(); // userId → socketId

  constructor(
    private jwtService: JwtService,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Driver) private driversRepo: Repository<Driver>,
    @InjectRepository(Trip) private tripsRepo: Repository<Trip>,
    @InjectRepository(CooperativeOwner) private coopOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(CooperativeMember) private coopMembersRepo: Repository<CooperativeMember>,
    @InjectRepository(Vehicle) private vehiclesRepo: Repository<Vehicle>,
    private fareService: FareService,
  ) {}

  // ── Init: configurar Redis adapter si está disponible ───────────────────────

  async afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn('REDIS_URL no configurado — Socket.IO en modo single-instance (no escala horizontal)');
      return;
    }
    try {
      const { default: Redis } = await import('ioredis');
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const pub = new Redis(redisUrl);
      const sub = pub.duplicate();
      pub.on('error', (err) => this.logger.error(`Redis pub error: ${err.message}`));
      sub.on('error', (err) => this.logger.error(`Redis sub error: ${err.message}`));
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Socket.IO Redis adapter activo — escala horizontal habilitada');
    } catch (err) {
      this.logger.error(`Redis adapter falló (usando in-memory): ${(err as Error).message}`);
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticate(socket);
      socket.data.user = user;
      this.socketUsers.set(socket.id, user.id);
      this.userSockets.set(user.id, socket.id);

      await socket.join(ROOM.user(user.id));
      await this.joinRoleRooms(socket, user);

      this.logger.log(`Connected: ${user.role} ${user.id} (socket ${socket.id})`);
    } catch {
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = this.socketUsers.get(socket.id);
    if (userId) {
      this.socketUsers.delete(socket.id);
      this.userSockets.delete(userId);
      this.logger.log(`Disconnected: user ${userId} (socket ${socket.id})`);
    }
  }

  // ── Driver: actualizar ubicación ────────────────────────────────────────────
  //
  // Optimizaciones vs. la versión ingenua:
  //   - driverId y coopIds se leen del cache socket.data (cargado al conectar)
  //   - escritura de ubicación en DB es fire-and-forget (no bloquea el broadcast)
  //   - getConfig() usa caché en memoria de 1 minuto en FareService
  //   - activeTrip y config se cargan en paralelo con Promise.all
  //   - resultado: 1 query por ping (activeTrip) en lugar de 5-6

  @SubscribeMessage('location.update')
  async handleLocationUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { lat: number; lng: number; speed_kmh?: number },
  ) {
    const user: User = socket.data.user;
    if (user.role !== UserRole.DRIVER) throw new WsException('Solo conductores');

    const { lat, lng } = data;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new WsException('lat y lng deben ser números');
    }

    const driverId = socket.data.driverId as string;
    if (!driverId) throw new WsException('Perfil de conductor no encontrado');

    // Posición y tiempo previos — para calcular distancia/tiempo en el taxímetro
    const prevLat = socket.data.prevLat as number | undefined;
    const prevLng = socket.data.prevLng as number | undefined;
    const prevPingMs = socket.data.lastPingMs as number | undefined;
    const nowMs = Date.now();
    socket.data.prevLat = lat;
    socket.data.prevLng = lng;
    socket.data.lastPingMs = nowMs;

    // Escribir ubicación en DB sin bloquear el resto del handler
    this.driversRepo.update(driverId, {
      current_lat: lat,
      current_lng: lng,
      last_seen_at: new Date(),
    }).catch(err => this.logger.error(`Location write failed for ${driverId}: ${err.message}`));

    const payload = { driver_id: driverId, lat, lng, ts: Date.now() };

    socket.to(ROOM.platform).emit('driver.location', payload);

    // Broadcast a cooperativas usando IDs cacheadas (sin query a DB)
    const coopIds = socket.data.coopIds as string[] ?? [];
    for (const coopId of coopIds) {
      socket.to(ROOM.coop(coopId)).emit('driver.location', payload);
    }

    // Config (caché 1 min) y viaje activo en paralelo — única query real por ping
    const [config, activeTrip] = await Promise.all([
      this.fareService.getConfig(),
      this.tripsRepo.findOne({
        where: {
          driver: { id: driverId },
          status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
        },
        relations: ['cooperative'],
      }),
    ]);

    if (!activeTrip) return { ok: true };

    socket.to(ROOM.trip(activeTrip.id)).emit('driver.location', payload);

    if (activeTrip.status === TripStatus.IN_PROGRESS) {
      // ── Taxímetro virtual ────────────────────────────────────────────────────
      if (activeTrip.fare_mode === FareMode.METER && prevLat != null && prevLng != null) {
        const distKm = this.fareService.haversineDistance(prevLat, prevLng, lat, lng);
        const speedKmh: number = data.speed_kmh ?? 0;
        const threshold = parseFloat(config.slow_speed_threshold_kmh as any);
        // Cuando lento/parado usamos el tiempo real transcurrido entre pings,
        // no la duración derivada de distancia (que sería 0 si el taxi no se mueve).
        const elapsedMin = prevPingMs != null ? (nowMs - prevPingMs) / 60000 : 0;
        const durationMin = speedKmh < threshold ? elapsedMin : (distKm / Math.max(speedKmh, 1)) * 60;

        const newMeter = this.fareService.updateMeter(
          parseFloat(activeTrip.meter_amount as any) || 0,
          distKm, durationMin, speedKmh, config,
        );
        const incrementPerSecond = this.fareService.calculateIncrementPerSecond(speedKmh, config);

        this.tripsRepo.update(activeTrip.id, { meter_amount: newMeter as any })
          .catch(err => this.logger.error(`Meter write failed: ${err.message}`));

        socket.to(ROOM.trip(activeTrip.id)).emit('trip.meter_update', {
          trip_id: activeTrip.id,
          meter_amount: newMeter,
          increment_per_second: incrementPerSecond,
          speed_kmh: speedKmh,
          is_stopped: speedKmh < threshold,
        });
      }

      // ── Detección de desvío ──────────────────────────────────────────────────
      if (activeTrip.route_geometry) {
        try {
          const geometry = JSON.parse(activeTrip.route_geometry) as GeoJsonLineString;
          const onRoute = this.fareService.isOnRoute(lat, lng, geometry, config.deviation_threshold_m);

          if (!onRoute) {
            const newRoute = await this.fareService.getRouteInfo(
              lat, lng,
              parseFloat(activeTrip.destination_lat as any),
              parseFloat(activeTrip.destination_lng as any),
            );

            if (newRoute.geometry) {
              this.tripsRepo.update(activeTrip.id, {
                route_geometry: JSON.stringify(newRoute.geometry),
              }).catch(err => this.logger.error(`Route update failed: ${err.message}`));
            }

            const reroutedPayload = {
              trip_id: activeTrip.id,
              driver_id: driverId,
              driver_lat: lat,
              driver_lng: lng,
              remaining_km: newRoute.distance_km,
              remaining_min: newRoute.duration_min,
              route_geometry: newRoute.geometry,
            };

            // Notificar al cliente y al conductor (sala del viaje)
            socket.to(ROOM.trip(activeTrip.id)).emit('trip.rerouted', reroutedPayload);

            // Notificar al panel web de la cooperativa para intervención inmediata
            if (activeTrip.cooperative) {
              socket.to(ROOM.coop(activeTrip.cooperative.id)).emit('driver.deviation', {
                trip_id: activeTrip.id,
                driver_id: driverId,
                driver_lat: lat,
                driver_lng: lng,
                remaining_km: newRoute.distance_km,
                ts: Date.now(),
              });
            }
          }
        } catch {
          // route_geometry malformado — ignorar silenciosamente
        }
      }
    }

    return { ok: true };
  }

  // ── Cliente: suscribirse al seguimiento de su viaje ─────────────────────────

  @SubscribeMessage('trip.subscribe')
  async handleTripSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { trip_id: string },
  ) {
    const user: User = socket.data.user;
    const trip = await this.tripsRepo.findOne({
      where: { id: data.trip_id, client: { id: user.id } },
    });
    if (!trip) throw new WsException('Viaje no encontrado o no te pertenece');

    await socket.join(ROOM.trip(data.trip_id));
    return { ok: true, room: ROOM.trip(data.trip_id) };
  }

  @SubscribeMessage('trip.unsubscribe')
  async handleTripUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { trip_id: string },
  ) {
    await socket.leave(ROOM.trip(data.trip_id));
    return { ok: true };
  }

  // ── Cliente: actualizar su ubicación mientras espera al conductor ───────────

  @SubscribeMessage('client.location.update')
  async handleClientLocationUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { lat: number; lng: number },
  ) {
    const user: User = socket.data.user;
    if (user.role !== UserRole.CLIENT) throw new WsException('Solo clientes');

    const { lat, lng } = data;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new WsException('lat y lng deben ser números');
    }

    const activeTrip = await this.tripsRepo.findOne({
      where: {
        client: { id: user.id },
        status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED]),
      },
      relations: ['driver'],
    });

    if (!activeTrip) return { ok: false, reason: 'No hay viaje activo en estado ACCEPTED' };

    this.tripsRepo.update(activeTrip.id, {
      client_current_lat: lat,
      client_current_lng: lng,
    }).catch(err => this.logger.error(`Client location write failed: ${err.message}`));

    if (activeTrip.driver) {
      socket.to(ROOM.driver(activeTrip.driver.id)).emit('client.location', {
        trip_id: activeTrip.id,
        lat,
        lng,
        ts: Date.now(),
      });
    }

    return { ok: true };
  }

  // ── Métodos públicos para TripsService y DriversService ─────────────────────

  notifyNewTrip(payload: object, cooperativeId?: string) {
    if (cooperativeId) {
      this.server.to(ROOM.coop(cooperativeId)).emit('trip.new', payload);
    } else {
      this.server.to(ROOM.available).emit('trip.new', payload);
    }
  }

  notifyTripUpdate(tripId: string, event: string, payload: object) {
    this.server.to(ROOM.trip(tripId)).emit(event, payload);
    this.server.to(ROOM.platform).emit(event, { trip_id: tripId, ...payload });
  }

  notifyDriver(driverId: string, event: string, payload: object) {
    this.server.to(ROOM.driver(driverId)).emit(event, payload);
  }

  notifyUser(userId: string, event: string, payload: object) {
    this.server.to(ROOM.user(userId)).emit(event, payload);
  }

  notifyCoop(coopId: string, event: string, payload: object) {
    this.server.to(ROOM.coop(coopId)).emit(event, payload);
  }

  notifyPlatform(event: string, payload: object) {
    this.server.to(ROOM.platform).emit(event, payload);
  }

  // Llamar después de start-day / end-day para que el socket del conductor
  // refleje inmediatamente su nueva cooperativa sin reconectarse.
  async refreshDriverSocketCache(userId: string): Promise<void> {
    const socketId = this.userSockets.get(userId);
    if (!socketId) return; // conductor no está conectado

    const socket = this.server.sockets.sockets.get(socketId);
    if (!socket) return;

    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (!driver) return;

    const memberships = await this.coopOwnersRepo.find({
      where: { owner: { id: driver.id }, approval_status: OwnerApprovalStatus.APPROVED },
      relations: ['cooperative'],
    });
    const coopIds = memberships.map(m => m.cooperative.id);
    const activeVehicleCoop = driver.active_vehicle?.cooperative;
    if (activeVehicleCoop && !coopIds.includes(activeVehicleCoop.id)) {
      coopIds.push(activeVehicleCoop.id);
      await socket.join(ROOM.coop(activeVehicleCoop.id));
    }
    socket.data.coopIds = coopIds;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async authenticate(socket: Socket): Promise<User> {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) throw new WsException('Token requerido');

    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
    } catch {
      throw new WsException('Token inválido o expirado');
    }

    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new WsException('Usuario inactivo');
    }
    return user;
  }

  private async joinRoleRooms(socket: Socket, user: User) {
    if (user.role === UserRole.DRIVER) {
      // Carga todo en una sola query con relaciones — se ejecuta solo al conectar
      const driver = await this.driversRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['active_vehicle', 'active_vehicle.cooperative'],
      });
      if (!driver) return;

      // Cachear en socket.data — handleLocationUpdate usará esto en cada ping
      socket.data.driverId = driver.id;
      socket.data.prevLat = driver.current_lat ? parseFloat(driver.current_lat as any) : undefined;
      socket.data.prevLng = driver.current_lng ? parseFloat(driver.current_lng as any) : undefined;

      await socket.join(ROOM.driver(driver.id));

      if (driver.online_status !== DriverOnlineStatus.OFFLINE) {
        await socket.join(ROOM.available);
      }

      const memberships = await this.coopOwnersRepo.find({
        where: { owner: { id: driver.id }, approval_status: OwnerApprovalStatus.APPROVED },
        relations: ['cooperative'],
      });
      const coopIds = memberships.map(m => m.cooperative.id);
      for (const coopId of coopIds) {
        await socket.join(ROOM.coop(coopId));
      }

      const activeVehicleCoop = driver.active_vehicle?.cooperative;
      if (activeVehicleCoop && !coopIds.includes(activeVehicleCoop.id)) {
        coopIds.push(activeVehicleCoop.id);
        await socket.join(ROOM.coop(activeVehicleCoop.id));
      }

      // Cache de IDs de cooperativas para location.update
      socket.data.coopIds = coopIds;

      const activeTrip = await this.tripsRepo.findOne({
        where: {
          driver: { id: driver.id },
          status: In([TripStatus.ACCEPTED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS]),
        },
      });
      if (activeTrip) {
        await socket.join(ROOM.trip(activeTrip.id));
      }

    } else if (
      [UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR, UserRole.COOPERATIVE_SUPERVISOR].includes(user.role)
    ) {
      const member = await this.coopMembersRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['cooperative'],
      });
      if (member) {
        await socket.join(ROOM.coop(member.cooperative.id));
      }

    } else if (
      [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.MONITORING, UserRole.SUPPORT].includes(user.role)
    ) {
      await socket.join(ROOM.platform);
    }
  }
}
