import {
  Controller, Post, Get, Patch,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFile, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriverSafetyService } from './driver-safety.service';
import { ResolveDeviationAlertDto } from './dto/resolve-deviation-alert.dto';
import { DeviationAlertStatus } from './entities/trip-deviation-alert.entity';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const RESPONDERS = [
  UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT, UserRole.MONITORING,
  UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR,
];

@Controller('driver-safety')
@UseGuards(JwtGuard, RolesGuard)
export class DriverSafetyController {
  constructor(private readonly service: DriverSafetyService) {}

  // ── Conductor: selfie de verificación durante el viaje ────────────────────────

  @Post('trips/:tripId/selfie')
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FileInterceptor('file'))
  uploadSelfie(
    @CurrentUser() user: User,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadSafetyCheck(user.id, tripId, file);
  }

  // ── Cooperativa/plataforma: ver selfies de un viaje ────────────────────────────

  @Get('trips/:tripId/selfies')
  @Roles(...RESPONDERS)
  getSelfies(@CurrentUser() user: User, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.service.getSafetyChecks(user, tripId);
  }

  // ── Cooperativa/plataforma: alertas de desviación sostenida ───────────────────

  @Get('deviation-alerts')
  @Roles(...RESPONDERS)
  getDeviationAlerts(
    @CurrentUser() user: User,
    @Query('status') status?: DeviationAlertStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getDeviationAlerts(user, status, +page, +limit);
  }

  @Patch('deviation-alerts/:id/resolve')
  @Roles(...RESPONDERS)
  resolveDeviationAlert(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDeviationAlertDto,
  ) {
    return this.service.resolveDeviationAlert(user, id, dto);
  }
}
