import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe, ParseUUIDPipe, Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SendMessageDto, OpenOperatorConversationDto, OpenOwnerConversationDto, OpenApplicantConversationDto, OpenWithDriverDto } from './dto/chat.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ── Admin: todas las conversaciones ──────────────────────────────────────────
  @Get('admin/conversations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT, UserRole.MONITORING)
  getAllConversations(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.chatService.getAllConversationsAdmin(page, limit, search, type, from, to);
  }

  // ── Admin: mensajes de cualquier conversación ─────────────────────────────────
  @Get('admin/conversations/:id/messages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT, UserRole.MONITORING)
  getAdminMessages(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.chatService.getAdminMessages(conversationId, page, limit);
  }

  // ── Lista de conversaciones del usuario autenticado ───────────────────────────
  @Get('conversations')
  getMyConversations(@CurrentUser() user: User) {
    return this.chatService.getMyConversations(user);
  }

  // ── Abrir / obtener chat driver↔pasajero (por viaje) ─────────────────────────
  @Post('trip/:tripId/open')
  openTripConversation(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatService.getOrCreateTripConversation(tripId, user);
  }

  // ── Abrir / obtener chat driver↔dueño (por solicitud de vehículo aceptada) ───
  @Post('owner/open')
  openOwnerConversation(
    @CurrentUser() user: User,
    @Body() dto: OpenOwnerConversationDto,
  ) {
    return this.chatService.getOrCreateOwnerConversation(user, dto);
  }

  // ── Abrir / obtener chat dueño↔postulante desde una postulación ──────────────
  @Post('applicant/open')
  openApplicantConversation(
    @CurrentUser() user: User,
    @Body() dto: OpenApplicantConversationDto,
  ) {
    return this.chatService.getOrCreateApplicantConversation(user, dto);
  }

  // ── Abrir / obtener chat driver↔operadora (driver con su cooperativa) ─────────
  @Post('operator/open')
  openOperatorConversation(
    @CurrentUser() user: User,
    @Body() dto: OpenOperatorConversationDto,
  ) {
    return this.chatService.getOrCreateOperatorConversation(user, dto);
  }

  // ── Abrir / obtener chat cooperativa↔driver (la coop lo inicia con el taxista) ─
  @Post('operator/open-with-driver')
  openWithDriver(
    @CurrentUser() user: User,
    @Body() dto: OpenWithDriverDto,
  ) {
    return this.chatService.getOrCreateOperatorConversationWithDriver(user, dto.driver_id);
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────────
  @Post('messages')
  sendMessage(
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user, dto);
  }

  // ── Historial de mensajes de una conversación (paginado) ──────────────────────
  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.chatService.getMessages(user, conversationId, page, limit);
  }

  // ── Marcar conversación como leída (sin devolver mensajes) ───────────────────
  @Patch('conversations/:id/read')
  async markConversationRead(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    await this.chatService.markRead(conversationId, user);
    return { ok: true };
  }
}
