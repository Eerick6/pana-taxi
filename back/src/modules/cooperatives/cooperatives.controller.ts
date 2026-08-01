import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CooperativesService } from './cooperatives.service';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UploadCooperativeDocumentDto } from './dto/upload-cooperative-document.dto';
import { RejectCooperativeDto } from './dto/reject-cooperative.dto';
import { RejectCooperativeDocumentDto } from './dto/reject-cooperative-document.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';

const PLATFORM_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN];
const READ_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT];

@Controller('cooperatives')
@UseGuards(JwtGuard, RolesGuard)
export class CooperativesController {
  constructor(private readonly cooperativesService: CooperativesService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles(...PLATFORM_ROLES)
  create(@Body() dto: CreateCooperativeDto) {
    return this.cooperativesService.create(dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.cooperativesService.findAll(page, limit);
  }

  // Conductores pueden listar cooperativas activas para solicitar membresía
  @Get('active')
  @Roles(...READ_ROLES, UserRole.DRIVER)
  listActive(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.cooperativesService.listActive(page, limit);
  }

  // Must be before :id to avoid route collision
  @Get('pending')
  @Roles(...PLATFORM_ROLES)
  listPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.cooperativesService.listPending(page, limit);
  }

  @Delete('members/:memberId')
  @Roles(...PLATFORM_ROLES)
  removeMember(@Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.cooperativesService.removeMember(memberId);
  }

  @Get(':id')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.findOne(id);
  }

  @Patch(':id/profile')
  @Roles(UserRole.COOPERATIVE_ADMIN)
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { phone?: string; address?: string; latitude?: number; longitude?: number },
    @CurrentUser() user: User,
  ) {
    if (user.cooperative_id !== id) throw new ForbiddenException('No puedes modificar otra cooperativa');
    return this.cooperativesService.updateProfile(id, dto);
  }

  @Patch(':id')
  @Roles(...PLATFORM_ROLES)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCooperativeDto) {
    return this.cooperativesService.update(id, dto);
  }

  @Patch(':id/suspend')
  @Roles(...PLATFORM_ROLES)
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.suspend(id);
  }

  @Patch(':id/activate')
  @Roles(...PLATFORM_ROLES)
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.activate(id);
  }

  @Patch(':id/set-fee')
  @Roles(...PLATFORM_ROLES)
  setFee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('monthly_fee') fee: number,
  ) {
    return this.cooperativesService.setMonthlyFee(id, fee);
  }

  @Delete(':id')
  @Roles(...PLATFORM_ROLES)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.remove(id);
  }

  // ─── DOCUMENTOS ────────────────────────────────────────────────────────────

  @Post(':id/documents')
  @Roles(...PLATFORM_ROLES, UserRole.COOPERATIVE_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadCooperativeDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.cooperativesService.uploadDocument(id, dto, file);
  }

  @Get(':id/documents')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN)
  getDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.getDocuments(id);
  }

  @Get(':id/documents/:docId/url')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN)
  getDocumentUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.cooperativesService.getDocumentUrl(id, docId);
  }

  @Patch(':id/documents/:docId/approve')
  @Roles(...PLATFORM_ROLES)
  approveDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.cooperativesService.approveDocument(id, docId);
  }

  @Patch(':id/documents/:docId/reject')
  @Roles(...PLATFORM_ROLES)
  rejectDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: RejectCooperativeDocumentDto,
  ) {
    return this.cooperativesService.rejectDocument(id, docId, dto);
  }

  // ─── APROBACIÓN DE COOPERATIVA ─────────────────────────────────────────────

  @Patch(':id/approve')
  @Roles(...PLATFORM_ROLES)
  approveCooperative(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.approveCooperative(id);
  }

  @Patch(':id/reject')
  @Roles(...PLATFORM_ROLES)
  rejectCooperative(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCooperativeDto,
  ) {
    return this.cooperativesService.rejectCooperative(id, dto);
  }

  // ─── MIEMBROS ──────────────────────────────────────────────────────────────

  @Post(':id/members')
  @Roles(...PLATFORM_ROLES)
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.cooperativesService.addMember(id, dto);
  }

  @Get(':id/members')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN)
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.listMembers(id);
  }

  @Get(':id/owners')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  listOwners(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number = 100,
  ) {
    return this.cooperativesService.listOwners(id, status, page, limit);
  }

  // Snapshot de flota para el mapa del panel web
  // Devuelve todos los conductores en línea con su posición actual
  // El frontend escucha además el evento WS 'driver.location' para actualizaciones en tiempo real
  @Get(':id/fleet')
  @Roles(...READ_ROLES, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  getFleet(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperativesService.getFleet(id);
  }
}
