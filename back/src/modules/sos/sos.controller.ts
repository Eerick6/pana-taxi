import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { SosService } from './sos.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';
import { SosStatus } from './entities/sos-alert.entity';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const RESPONDERS = [
  UserRole.OWNER, UserRole.PLATFORM_ADMIN,
  UserRole.SUPPORT, UserRole.MONITORING,
];

@Controller('sos')
@UseGuards(JwtGuard, RolesGuard)
export class SosController {
  constructor(private readonly sosService: SosService) {}

  // CLIENT or DRIVER triggers SOS
  @Post()
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  trigger(@CurrentUser() user: User, @Body() dto: TriggerSosDto) {
    return this.sosService.trigger(user.id, dto);
  }

  // Platform/support views all alerts
  @Get()
  @Roles(...RESPONDERS)
  getAlerts(
    @Query('status') status?: SosStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.sosService.getAlerts(status, +page, +limit);
  }

  @Get(':id')
  @Roles(...RESPONDERS)
  getAlertById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sosService.getAlertById(id);
  }

  // Platform/support resolves an alert
  @Patch(':id/resolve')
  @Roles(...RESPONDERS)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ResolveSosDto,
  ) {
    return this.sosService.resolve(id, user.id, dto);
  }
}
