import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { ConfirmSettlementDto } from './dto/confirm-settlement.dto';
import { AccountingFiltersDto } from './dto/accounting-filters.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('accounting')
@UseGuards(JwtGuard, RolesGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // ── Cuenta de cooperativa ────────────────────────────────────────────────────

  @Get('coop-account')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  getCoopAccount(@Query('cooperative_id', ParseUUIDPipe) cooperativeId: string) {
    return this.accountingService.getCoopAccount(cooperativeId);
  }

  @Get('coop-statement')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  getCoopStatement(@Query() filters: AccountingFiltersDto) {
    return this.accountingService.getCoopStatement(filters);
  }

  @Get('driver-statement')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  getDriverStatement(@Query() filters: AccountingFiltersDto) {
    return this.accountingService.getDriverStatement(filters);
  }

  // ── Liquidaciones ────────────────────────────────────────────────────────────

  @Get('settlements')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  listSettlements(@Query() filters: AccountingFiltersDto) {
    return this.accountingService.listSettlements(filters);
  }

  @Post('settlements')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  createSettlement(@Body() dto: CreateSettlementDto, @CurrentUser() user: User) {
    return this.accountingService.createSettlement(dto, user);
  }

  @Patch('settlements/:id/confirm')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  confirmSettlement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ConfirmSettlementDto,
  ) {
    return this.accountingService.confirmSettlement(id, user, dto);
  }

  @Delete('settlements/:id')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  cancelSettlement(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.cancelSettlement(id);
  }

  // ── Configuración de plataforma ──────────────────────────────────────────────

  @Get('platform-fee')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  getPlatformFee() {
    return this.accountingService.getPlatformFeeConfig();
  }

  @Patch('platform-fee')
  @Roles(UserRole.PLATFORM_ADMIN)
  setPlatformFee(@Body('rate') rate: number) {
    return this.accountingService.setPlatformFeeRate(rate);
  }
}
