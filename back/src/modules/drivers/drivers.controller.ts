import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { DriverOnlineStatus } from './entities/driver.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriversService } from './drivers.service';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { UploadDriverDocumentDto } from './dto/upload-driver-document.dto';
import { RejectDriverDto } from './dto/reject-driver.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { JoinCooperativeDto } from './dto/join-cooperative.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const PLATFORM_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT];
const COOP_WRITE_ROLES = [UserRole.OWNER, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR];
const COOP_READ_ROLES = [...COOP_WRITE_ROLES, UserRole.COOPERATIVE_SUPERVISOR];

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  // ── Self-registration (public) ────────────────────────────────────────────

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('register')
  register(@Body() dto: RegisterDriverDto) {
    return this.driversService.register(dto);
  }

  // ── Driver self-service (JWT required) ───────────────────────────────────

  @Get('me')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyProfile(@CurrentUser() user: User) {
    return this.driversService.getMyProfile(user.id);
  }

  @Patch('me/status')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  setStatus(@CurrentUser() user: User, @Body('status') status: DriverOnlineStatus) {
    return this.driversService.setOnlineStatus(user.id, status);
  }

  @Patch('me/request-review')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  requestReview(@CurrentUser() user: User) {
    return this.driversService.requestReview(user.id);
  }

  @Patch('me/location')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  updateLocation(
    @CurrentUser() user: User,
    @Body('lat') lat: number,
    @Body('lng') lng: number,
  ) {
    return this.driversService.updateLocation(user.id, lat, lng);
  }

  @Patch('me/confirm-active')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  confirmActive(@CurrentUser() user: User) {
    return this.driversService.confirmActive(user.id);
  }

  @Post('documents')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: User,
    @Body() dto: UploadDriverDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driversService.uploadDocument(user.id, dto, file);
  }

  @Get('documents')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyDocuments(@CurrentUser() user: User) {
    return this.driversService.getMyDocuments(user.id);
  }

  @Get('documents/:id/url')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getDocumentUrl(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.getDocumentUrl(user.id, id);
  }

  // ── Owner-driver: gestión de cooperativas ────────────────────────────────

  // ── Jornada laboral ─────────────────────────────────────────────────────
  // OWNER_DRIVER: body { vehicle_id } requerido
  // DRIVER (chofer): body vacío — usa la jornada activa del sistema de solicitudes

  @Post('me/start-day')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  startDay(@CurrentUser() user: User, @Body('vehicle_id') vehicleId?: string) {
    return this.driversService.startDay(user.id, vehicleId);
  }

  @Post('me/end-day')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  endDay(@CurrentUser() user: User) {
    return this.driversService.endDay(user.id);
  }

  // ── Owner-driver: gestión de cooperativas ────────────────────────────────

  @Post('me/cooperatives')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  joinCooperative(@CurrentUser() user: User, @Body() dto: JoinCooperativeDto) {
    return this.driversService.joinCooperative(user.id, dto);
  }

  @Get('me/cooperatives')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyCooperatives(@CurrentUser() user: User) {
    return this.driversService.getMyCooperatives(user.id);
  }

  // ── Platform staff: admin list ───────────────────────────────────────────

  @Get('nearby')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  findNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius', new DefaultValuePipe(5), ParseFloatPipe) radius: number,
  ) {
    return this.driversService.findNearby(lat, lng, Math.min(radius, 20));
  }

  @Get()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  listAll(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('approval_status') approvalStatus?: string,
    @Query('search') search?: string,
    @Query('cooperative_id') cooperativeId?: string,
  ) {
    // COOP roles solo ven conductores de su cooperativa — ignorar cooperative_id del query param
    const isCoop = [UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR].includes(user.role);
    const effectiveCoopId = isCoop ? (user.cooperative_id ?? undefined) : cooperativeId;
    return this.driversService.listAll(page, limit, approvalStatus, search, effectiveCoopId);
  }

  // ── Platform staff: reviews regular DRIVER type only ─────────────────────

  @Get('platform/pending')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  listPlatformPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.driversService.listPlatformPending(page, limit);
  }

  @Patch(':id/platform-approve')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  platformApprove(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.platformApprove(id);
  }

  @Patch(':id/platform-reject')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  platformReject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDriverDto) {
    return this.driversService.platformReject(id, dto);
  }

  // ── Cooperative staff: reviews OWNER_DRIVER from their cooperative ────────

  @Get('cooperative/members')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  listCooperativeMembers(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('cooperative_id') queryCoopId?: string,
  ) {
    const coopId = this.resolveCoopId(user, queryCoopId);
    return this.driversService.listCooperativeMembers(coopId, page, limit, search);
  }

  @Get('cooperative/pending')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  listCooperativePending(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cooperative_id') queryCoopId?: string,
  ) {
    const coopId = this.resolveCoopId(user, queryCoopId);
    return this.driversService.listCooperativePending(coopId, page, limit);
  }

  @Patch(':id/cooperative-approve')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  cooperativeApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('cooperative_id') queryCoopId?: string,
  ) {
    const coopId = this.resolveCoopId(user, queryCoopId);
    return this.driversService.cooperativeApprove(id, coopId);
  }

  @Patch(':id/cooperative-reject')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  cooperativeReject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectDriverDto,
    @Query('cooperative_id') queryCoopId?: string,
  ) {
    const coopId = this.resolveCoopId(user, queryCoopId);
    return this.driversService.cooperativeReject(id, coopId, dto);
  }

  // Devuelve cooperative_id validado según el rol:
  // - COOP staff → siempre usa el del JWT (no confiar en query params)
  // - OWNER → puede pasar cualquier cooperative_id por query param
  private resolveCoopId(user: User, queryCoopId?: string): string {
    const PURE_COOP_ROLES = [
      UserRole.COOPERATIVE_ADMIN,
      UserRole.COOPERATIVE_OPERATOR,
      UserRole.COOPERATIVE_SUPERVISOR,
    ];
    if (PURE_COOP_ROLES.includes(user.role)) {
      if (!user.cooperative_id) throw new ForbiddenException('No estás asociado a ninguna cooperativa');
      return user.cooperative_id;
    }
    // OWNER: requiere pasar cooperative_id por query
    if (!queryCoopId) throw new ForbiddenException('Se requiere cooperative_id para esta operación');
    return queryCoopId;
  }

  // ── Document approval (platform for drivers / coop for owner_drivers) ─────

  @Patch(':driverId/documents/:documentId/approve')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES, ...COOP_WRITE_ROLES)
  approveDocument(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.driversService.approveDocument(driverId, documentId);
  }

  @Patch(':driverId/documents/:documentId/reject')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES, ...COOP_WRITE_ROLES)
  rejectDocument(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.driversService.rejectDocument(driverId, documentId, dto);
  }

  @Get(':driverId/documents/:documentId/url')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES, ...COOP_READ_ROLES)
  getAdminDocumentUrl(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.driversService.getAdminDocumentUrl(driverId, documentId);
  }

  @Patch(':id/block')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  blockDriver(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.blockDriver(id);
  }

  @Patch(':id/unblock')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  unblockDriver(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.unblockDriver(id);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  deleteDriver(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.deleteDriver(id);
  }

  @Get(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES, ...COOP_READ_ROLES)
  getDriverById(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.getDriverById(id);
  }
}
