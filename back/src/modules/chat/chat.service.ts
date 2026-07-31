import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { VehicleRequest, VehicleRequestStatus } from '../vehicle-requests/entities/vehicle-request.entity';
import { VehicleRequestApplication } from '../vehicle-requests/entities/vehicle-request-application.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Driver, DriverType } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';
import { VehicleAssignment, AssignmentStatus } from '../vehicles/entities/vehicle-assignment.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { SendMessageDto, OpenOperatorConversationDto, OpenOwnerConversationDto, OpenApplicantConversationDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    @InjectRepository(Message)      private msgRepo: Repository<Message>,
    @InjectRepository(Trip)         private tripsRepo: Repository<Trip>,
    @InjectRepository(VehicleRequest) private vehicleRequestsRepo: Repository<VehicleRequest>,
    @InjectRepository(CooperativeMember) private coopMembersRepo: Repository<CooperativeMember>,
    @InjectRepository(Driver)       private driversRepo: Repository<Driver>,
    @InjectRepository(Client)       private clientsRepo: Repository<Client>,
    @InjectRepository(VehicleAssignment) private assignmentsRepo: Repository<VehicleAssignment>,
    @InjectRepository(CooperativeOwner)  private coopOwnersRepo: Repository<CooperativeOwner>,
    @InjectRepository(VehicleRequestApplication) private applicationsRepo: Repository<VehicleRequestApplication>,
    private gateway: EventsGateway,
  ) {}

  // ── Abrir conversación taxista ↔ pasajero (se crea automáticamente al aceptar el viaje) ──

  async getOrCreateTripConversation(tripId: string, user: User): Promise<Conversation> {
    const trip = await this.tripsRepo.findOne({
      where: { id: tripId },
      relations: ['driver', 'driver.user', 'client'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (!trip.driver) throw new BadRequestException('El viaje no tiene conductor asignado aún');
    if (!trip.client) throw new BadRequestException('El viaje no tiene cliente');

    const isClient = trip.client.id === user.id;
    const isDriver = trip.driver.user?.id === user.id;
    if (!isClient && !isDriver)
      throw new ForbiddenException('No eres participante de este viaje');

    const existing = await this.convRepo.findOne({
      where: { trip: { id: tripId }, type: ConversationType.DRIVER_CLIENT },
    });
    if (existing) return existing;

    return this.convRepo.save(
      this.convRepo.create({
        type: ConversationType.DRIVER_CLIENT,
        participant_a: trip.driver.user,
        participant_b: trip.client,
        trip,
      }),
    );
  }

  // ── Abrir conversación conductor ↔ dueño (cuando el dueño acepta una postulación) ──

  async getOrCreateOwnerConversation(user: User, dto: OpenOwnerConversationDto): Promise<Conversation> {
    const request = await this.vehicleRequestsRepo.findOne({
      where: { id: dto.vehicle_request_id },
      relations: ['owner', 'owner.user', 'accepted_driver', 'accepted_driver.user'],
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== VehicleRequestStatus.ACCEPTED) {
      throw new BadRequestException('La solicitud debe estar aceptada para abrir el chat');
    }
    if (!request.accepted_driver) throw new BadRequestException('No hay conductor aceptado en esta solicitud');

    const ownerUserId = request.owner.user.id;
    const driverUserId = request.accepted_driver.user.id;

    // Solo los participantes pueden abrir esta conversación
    if (user.id !== ownerUserId && user.id !== driverUserId) {
      throw new ForbiddenException('No eres parte de esta conversación');
    }

    const existing = await this.convRepo.findOne({
      where: { vehicle_request: { id: dto.vehicle_request_id }, type: ConversationType.DRIVER_OWNER },
    });
    if (existing) return existing;

    return this.convRepo.save(
      this.convRepo.create({
        type: ConversationType.DRIVER_OWNER,
        participant_a: request.accepted_driver.user,
        participant_b: request.owner.user,
        vehicle_request: request,
      }),
    );
  }

  // ── Abrir conversación dueño ↔ postulante (antes de aceptar) ────────────────

  async getOrCreateApplicantConversation(user: User, dto: OpenApplicantConversationDto): Promise<Conversation> {
    const app = await this.applicationsRepo.findOne({
      where: { id: dto.application_id },
      relations: ['request', 'request.owner', 'request.owner.user', 'driver', 'driver.user'],
    });
    if (!app) throw new NotFoundException('Postulación no encontrada');

    const ownerUserId = app.request.owner.user.id;
    if (user.id !== ownerUserId) throw new ForbiddenException('Solo el dueño puede iniciar este chat');

    const existing = await this.convRepo.findOne({
      where: {
        type: ConversationType.DRIVER_OWNER,
        vehicle_request: { id: app.request.id },
        participant_a: { id: app.driver.user.id },
        participant_b: { id: ownerUserId },
      },
    });
    if (existing) return existing;

    return this.convRepo.save(
      this.convRepo.create({
        type: ConversationType.DRIVER_OWNER,
        participant_a: app.driver.user,
        participant_b: app.request.owner.user,
        vehicle_request: app.request,
      }),
    );
  }

  // ── Abrir conversación taxista ↔ operadora de su cooperativa ──────────────────

  async getOrCreateOperatorConversation(user: User, dto: OpenOperatorConversationDto): Promise<Conversation> {
    // El que inicia debe ser un driver vinculado a esa cooperativa
    const driver = await this.driversRepo.findOne({ where: { user: { id: user.id } } });
    if (!driver) throw new ForbiddenException('Solo conductores pueden iniciar este chat');

    // Verificar que el driver pertenece a la cooperativa (como OWNER_DRIVER o asignado)
    const ownerMembership = await this.coopOwnersRepo.findOne({
      where: { owner: { id: driver.id }, cooperative: { id: dto.cooperative_id } },
    });
    const assignment = await this.assignmentsRepo.findOne({
      where: { driver: { id: driver.id }, status: AssignmentStatus.ACTIVE },
      relations: ['vehicle', 'vehicle.cooperative'],
    });
    const isAssignedToCoop = assignment?.vehicle?.cooperative?.id === dto.cooperative_id;

    if (!ownerMembership && !isAssignedToCoop) {
      throw new ForbiddenException('No estás vinculado a esta cooperativa');
    }

    // Buscar un operador/admin de la coop para asignar como participant_b
    const operator = await this.coopMembersRepo.findOne({
      where: { cooperative: { id: dto.cooperative_id } },
      relations: ['user', 'cooperative'],
      order: { created_at: 'ASC' },
    });
    if (!operator) throw new BadRequestException('La cooperativa no tiene operadores registrados');

    // Buscar conversación existente entre este driver y esta cooperativa
    const existing = await this.convRepo.findOne({
      where: {
        type: ConversationType.DRIVER_OPERATOR,
        cooperative: { id: dto.cooperative_id },
        participant_a: { id: user.id },
      },
    });
    if (existing) return existing;

    return this.convRepo.save(
      this.convRepo.create({
        type: ConversationType.DRIVER_OPERATOR,
        participant_a: user,
        participant_b: operator.user,
        cooperative: operator.cooperative,
      }),
    );
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────────

  async sendMessage(user: User, dto: SendMessageDto) {
    const conv = await this.convRepo.findOne({
      where: { id: dto.conversation_id },
      relations: ['participant_a', 'participant_b'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const isParticipant =
      conv.participant_a.id === user.id || conv.participant_b.id === user.id;
    if (!isParticipant) throw new ForbiddenException('No eres parte de esta conversación');

    const message = await this.msgRepo.save(
      this.msgRepo.create({
        conversation: conv,
        conversation_id: conv.id,
        sender: user,
        sender_id: user.id,
        content: dto.content.trim(),
      }),
    );

    await this.convRepo.update(conv.id, { last_message_at: new Date() });

    const payload = {
      conversation_id: conv.id,
      message_id: message.id,
      sender_id: user.id,
      sender_name: user.email,
      content: message.content,
      created_at: message.created_at.toISOString(),
    };

    // Entregar en tiempo real vía WebSocket
    await this.gateway.deliverChatMessage(payload);

    return message;
  }

  // ── Historial de mensajes ─────────────────────────────────────────────────────

  async getMessages(user: User, conversationId: string, page = 1, limit = 50) {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
      relations: ['participant_a', 'participant_b'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const isParticipant =
      conv.participant_a.id === user.id || conv.participant_b.id === user.id;
    if (!isParticipant) throw new ForbiddenException('No eres parte de esta conversación');

    const [items, total] = await this.msgRepo.findAndCount({
      where: { conversation_id: conversationId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['sender'],
    });

    // Marcar como leídos los mensajes del otro participante
    await this.msgRepo
      .createQueryBuilder()
      .update()
      .set({ read_at: new Date() })
      .where('conversation_id = :cid AND sender_id != :uid AND read_at IS NULL', {
        cid: conversationId,
        uid: user.id,
      })
      .execute();

    // Enriquecer sender con nombre real
    const senderIds = [...new Set(items.map((m) => m.sender.id))];
    const nameMap = await this.resolveNames(senderIds);
    const enriched = items.map((m) => ({
      ...m,
      sender: { ...m.sender, full_name: nameMap.get(m.sender.id) ?? null },
    }));

    return { items: enriched.reverse(), total, page, limit };
  }

  // ── Marcar mensajes como leídos (sin devolver el historial) ──────────────────

  async markRead(conversationId: string, user: User): Promise<void> {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
      relations: ['participant_a', 'participant_b'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const isParticipant =
      conv.participant_a.id === user.id || conv.participant_b.id === user.id;
    if (!isParticipant) throw new ForbiddenException('No eres parte de esta conversación');

    await this.msgRepo
      .createQueryBuilder()
      .update()
      .set({ read_at: new Date() })
      .where('conversation_id = :cid AND sender_id != :uid AND read_at IS NULL', {
        cid: conversationId,
        uid: user.id,
      })
      .execute();
  }

  // ── Resolver nombre de display desde perfil de driver o cliente ──────────────

  private async resolveNames(userIds: string[]): Promise<Map<string, string>> {
    if (!userIds.length) return new Map();
    const nameMap = new Map<string, string>();

    const drivers = await this.driversRepo.find({
      where: userIds.map((id) => ({ user: { id } })),
      relations: ['user'],
    });
    for (const d of drivers) if (d.user) nameMap.set(d.user.id, d.full_name);

    const missingIds = userIds.filter((id) => !nameMap.has(id));
    if (missingIds.length) {
      const clients = await this.clientsRepo.find({
        where: missingIds.map((id) => ({ user: { id } })),
        relations: ['user'],
      });
      for (const c of clients) if (c.user) nameMap.set(c.user.id, c.full_name);
    }

    return nameMap;
  }

  // ── Admin: todas las conversaciones (sin filtro de participante) ─────────────

  async getAllConversationsAdmin(
    page = 1,
    limit = 30,
    search?: string,
    type?: string,
    from?: string,
    to?: string,
  ) {
    const qb = this.convRepo.createQueryBuilder('conv')
      .leftJoinAndSelect('conv.participant_a', 'pa')
      .leftJoinAndSelect('conv.participant_b', 'pb')
      .leftJoinAndSelect('conv.trip', 'trip')
      .leftJoinAndSelect('conv.vehicle_request', 'vr')
      .leftJoinAndSelect('conv.cooperative', 'coop')
      .leftJoin('drivers', 'da', 'da.user_id = pa.id')
      .leftJoin('drivers', 'db', 'db.user_id = pb.id')
      .leftJoin('clients', 'ca', 'ca.user_id = pa.id')
      .leftJoin('clients', 'cb', 'cb.user_id = pb.id');

    if (type) {
      qb.andWhere('conv.type = :type', { type });
    }
    if (search) {
      const s = `%${search}%`;
      qb.andWhere(
        `(pa.phone LIKE :s OR pa.email LIKE :s
          OR pb.phone LIKE :s OR pb.email LIKE :s
          OR da.full_name LIKE :s OR db.full_name LIKE :s
          OR ca.full_name LIKE :s OR cb.full_name LIKE :s)`,
        { s },
      );
    }
    if (from) {
      qb.andWhere('conv.last_message_at >= :from', { from });
    }
    if (to) {
      qb.andWhere('conv.last_message_at <= :to', { to: `${to} 23:59:59` });
    }

    // Separate count (avoids TypeORM DISTINCT subquery that generates invalid MySQL syntax)
    const total = await qb.getCount();
    const convs = await qb
      .orderBy('conv.last_message_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const allUserIds = [...new Set(convs.flatMap((c) => [c.participant_a.id, c.participant_b.id]))];
    const nameMap = await this.resolveNames(allUserIds);

    const items = await Promise.all(
      convs.map(async (c) => {
        const lastMsg = await this.msgRepo.findOne({
          where: { conversation_id: c.id },
          order: { created_at: 'DESC' },
        });
        const msgCount = await this.msgRepo.count({ where: { conversation_id: c.id } });
        return {
          ...c,
          message_count: msgCount,
          last_message: lastMsg ? { content: lastMsg.content, created_at: lastMsg.created_at } : null,
          participant_a: { ...c.participant_a, full_name: nameMap.get(c.participant_a.id) ?? null },
          participant_b: { ...c.participant_b, full_name: nameMap.get(c.participant_b.id) ?? null },
        };
      }),
    );

    return { items, total, page, limit };
  }

  // ── Admin: mensajes de cualquier conversación ─────────────────────────────────

  async getAdminMessages(conversationId: string, page = 1, limit = 50) {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
      relations: ['participant_a', 'participant_b'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const [items, total] = await this.msgRepo.findAndCount({
      where: { conversation_id: conversationId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['sender'],
    });

    const senderIds = [...new Set(items.map((m) => m.sender.id))];
    const nameMap = await this.resolveNames(senderIds);
    const enriched = items.map((m) => ({
      ...m,
      sender: { ...m.sender, full_name: nameMap.get(m.sender.id) ?? null },
    }));

    return { items: enriched.reverse(), total, page, limit };
  }

  // ── Lista de conversaciones del usuario ───────────────────────────────────────

  async getMyConversations(user: User) {
    const convs = await this.convRepo.find({
      where: [
        { participant_a: { id: user.id } },
        { participant_b: { id: user.id } },
      ],
      relations: ['participant_a', 'participant_b', 'trip', 'vehicle_request', 'cooperative'],
      order: { last_message_at: 'DESC' },
    });

    const allUserIds = [...new Set(convs.flatMap((c) => [c.participant_a.id, c.participant_b.id]))];
    const nameMap = await this.resolveNames(allUserIds);

    const withUnread = await Promise.all(
      convs.map(async (c) => {
        const unread = await this.msgRepo.count({
          where: { conversation_id: c.id, read_at: null as any, sender_id: c.participant_a.id === user.id ? c.participant_b.id : c.participant_a.id },
        });
        return {
          ...c,
          unread_count: unread,
          participant_a: { ...c.participant_a, full_name: nameMap.get(c.participant_a.id) ?? null },
          participant_b: { ...c.participant_b, full_name: nameMap.get(c.participant_b.id) ?? null },
        };
      }),
    );

    return withUnread;
  }
}
