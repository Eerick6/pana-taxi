import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VehiclesService } from './vehicles.service';
import { RegisterVehicleDto } from './dto/register-vehicle.dto';
import { UploadVehicleDocumentDto } from './dto/upload-vehicle-document.dto';
import { RejectVehicleDto } from './dto/reject-vehicle.dto';
import { RejectDocumentDto } from '../drivers/dto/reject-document.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const COOP_WRITE_ROLES = [
  UserRole.OWNER,
  UserRole.PLATFORM_ADMIN,
  UserRole.COOPERATIVE_ADMIN,
  UserRole.COOPERATIVE_OPERATOR,
];
const COOP_READ_ROLES = [...COOP_WRITE_ROLES, UserRole.COOPERATIVE_SUPERVISOR];

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ── Owner-driver endpoints ────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  registerVehicle(@CurrentUser() user: User, @Body() dto: RegisterVehicleDto) {
    return this.vehiclesService.registerVehicle(user.id, dto);
  }

  @Get('mine')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyVehicles(@CurrentUser() user: User) {
    return this.vehiclesService.getMyVehicles(user.id);
  }

  @Post(':vehicleId/documents')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: User,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UploadVehicleDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadVehicleDocument(user.id, vehicleId, dto, file);
  }

  @Get(':vehicleId/documents')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getDocuments(@CurrentUser() user: User, @Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.vehiclesService.getVehicleDocuments(user.id, vehicleId);
  }

  @Get(':vehicleId/documents/:documentId/url')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getDocumentUrl(
    @CurrentUser() user: User,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.vehiclesService.getVehicleDocumentUrl(user.id, vehicleId, documentId);
  }

  @Patch(':id/assign-driver')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  assignDriver(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Body('driver_id') driverId: string | null,
  ) {
    return this.vehiclesService.assignDriver(vehicleId, user.id, driverId ?? null);
  }

  // ── Cooperative admin / platform staff endpoints ──────────────────────────

  @Get()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  listAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.vehiclesService.listAll(page, limit, status, search);
  }

  @Get('pending')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  listPending(
    @Query('cooperative_id', ParseUUIDPipe) cooperativeId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.vehiclesService.listPendingByCooperative(cooperativeId, page, limit);
  }

  @Get(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  getVehicleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.getVehicleById(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.approveVehicle(id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectVehicleDto) {
    return this.vehiclesService.rejectVehicle(id, dto);
  }

  @Patch(':vehicleId/documents/:documentId/approve')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  approveDocument(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.vehiclesService.approveVehicleDocument(vehicleId, documentId);
  }

  @Patch(':vehicleId/documents/:documentId/reject')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_WRITE_ROLES)
  rejectDocument(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.vehiclesService.rejectVehicleDocument(vehicleId, documentId, dto);
  }

  @Get(':vehicleId/admin-documents/:documentId/url')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(...COOP_READ_ROLES)
  getAdminDocumentUrl(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.vehiclesService.getAdminDocumentUrl(vehicleId, documentId);
  }
}
