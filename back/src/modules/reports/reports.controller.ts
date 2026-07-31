import {
  Controller, Get, Query, UseGuards, Res, Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const FINANCE_ROLES = [
  UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE,
  UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_SUPERVISOR, UserRole.SUPPORT,
];

@Controller('reports')
@UseGuards(JwtGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-stats')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.MONITORING)
  getDashboardStats(@Query('cooperative_id') cooperativeId?: string) {
    return this.reportsService.getDashboardStats(cooperativeId);
  }

  @Get('global')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE, UserRole.MONITORING)
  getGlobal(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getGlobal(from, to);
  }

  @Get('daily')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE, UserRole.MONITORING)
  getDaily(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getDaily(from, to);
  }

  @Get('summary')
  @Roles(...FINANCE_ROLES)
  getSummary(@CurrentUser() user: User, @Query() filters: ReportFiltersDto) {
    return this.reportsService.getSummary(user, filters);
  }

  @Get('trips')
  @Roles(...FINANCE_ROLES)
  getTrips(@CurrentUser() user: User, @Query() filters: ReportFiltersDto) {
    return this.reportsService.getTrips(user, filters);
  }

  @Get('drivers')
  @Roles(...FINANCE_ROLES)
  getDriverEarnings(@CurrentUser() user: User, @Query() filters: ReportFiltersDto) {
    return this.reportsService.getDriverEarnings(user, filters);
  }

  @Get('cooperatives')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
  getCooperativeBreakdown(@CurrentUser() user: User, @Query() filters: ReportFiltersDto) {
    return this.reportsService.getCooperativeBreakdown(user, filters);
  }

  @Get('wallets')
  @Roles(...FINANCE_ROLES)
  getWalletBalances(@CurrentUser() user: User, @Query() filters: ReportFiltersDto) {
    return this.reportsService.getWalletBalances(user, filters);
  }

  @Get('trips/export')
  @Roles(...FINANCE_ROLES)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="trips.csv"')
  async exportCsv(@CurrentUser() user: User, @Query() filters: ReportFiltersDto, @Res() res: Response) {
    const csv = await this.reportsService.exportTripsCsv(user, filters);
    res.send(csv);
  }
}
