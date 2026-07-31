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
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SetConfigDto } from './dto/set-config.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SubscriptionStatus } from './entities/cooperative-subscription.entity';
import { LeadStatus } from './entities/contact-lead.entity';
import { CoopApplicationStatus } from './entities/cooperative-application.entity';

const READ_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN];

@Controller('platform')
@UseGuards(JwtGuard, RolesGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  // ── Staff ────────────────────────────────────────────────────────────────────

  @Post('staff')
  @Roles(UserRole.OWNER)
  createStaff(@Body() dto: CreateStaffDto) {
    return this.platformService.createStaff(dto);
  }

  @Get('staff')
  @Roles(...READ_ROLES)
  listStaff(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.platformService.listStaff(page, limit);
  }

  @Get('staff/:id')
  @Roles(...READ_ROLES)
  getStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.getStaff(id);
  }

  @Patch('staff/:id')
  @Roles(UserRole.OWNER)
  updateStaff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.platformService.updateStaff(id, dto);
  }

  @Delete('staff/:id')
  @Roles(UserRole.OWNER)
  removeStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.removeStaff(id);
  }

  // ── Configuración global ─────────────────────────────────────────────────────

  @Get('config')
  @Roles(...READ_ROLES)
  listConfigs() {
    return this.platformService.listConfigs();
  }

  @Patch('config/:key')
  @Roles(UserRole.OWNER)
  setConfig(
    @Param('key') key: string,
    @Body() dto: SetConfigDto,
    @Request() req,
  ) {
    return this.platformService.setConfig(key, dto, req.user.sub);
  }

  // ── Mensualidades ────────────────────────────────────────────────────────────

  @Get('subscriptions')
  @Roles(...READ_ROLES)
  listSubscriptions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: SubscriptionStatus,
    @Query('cooperative_id') cooperative_id?: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year?: number,
    @Query('month', new DefaultValuePipe(0), ParseIntPipe) month?: number,
  ) {
    return this.platformService.listSubscriptions(page, limit, {
      status,
      cooperative_id,
      year: year || undefined,
      month: month || undefined,
    });
  }

  @Post('subscriptions/generate')
  @Roles(UserRole.OWNER)
  generateSubscriptions(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @Request() req,
  ) {
    return this.platformService.generateMonthlySubscriptions(month, year, req.user.sub);
  }

  @Patch('subscriptions/:id/mark-paid')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
  ) {
    return this.platformService.markSubscriptionPaid(id, dto);
  }

  @Patch('subscriptions/:id/mark-overdue')
  @Roles(UserRole.OWNER)
  markOverdue(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.markSubscriptionOverdue(id);
  }

  // ── Solicitudes de contacto ──────────────────────────────────────────────────

  @Get('leads')
  @Roles(...READ_ROLES)
  listLeads(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: LeadStatus,
  ) {
    return this.platformService.listLeads(page, limit, status);
  }

  @Patch('leads/:id/status')
  @Roles(...READ_ROLES)
  updateLeadStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: LeadStatus,
  ) {
    return this.platformService.updateLeadStatus(id, status);
  }

  @Delete('leads/:id')
  @Roles(UserRole.OWNER)
  deleteLead(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.deleteLead(id);
  }

  // ── Solicitudes de registro de cooperativas ──────────────────────────────────

  @Get('coop-applications')
  @Roles(...READ_ROLES)
  listCoopApplications(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: CoopApplicationStatus,
  ) {
    return this.platformService.listCoopApplications(page, limit, status);
  }

  @Patch('coop-applications/:id/status')
  @Roles(...READ_ROLES)
  updateCoopApplicationStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: CoopApplicationStatus,
  ) {
    return this.platformService.updateCoopApplicationStatus(id, status);
  }

  @Delete('coop-applications/:id')
  @Roles(UserRole.OWNER)
  deleteCoopApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.deleteCoopApplication(id);
  }
}
