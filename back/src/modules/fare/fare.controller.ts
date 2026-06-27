import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { FareService } from './fare.service';
import { SetFareConfigDto } from './dto/set-fare-config.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('fares')
@UseGuards(JwtGuard, RolesGuard)
export class FareController {
  constructor(private readonly fareService: FareService) {}

  // Ver configuración de tarifas (regulación ANT vigente)
  @Get('config')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN)
  getConfig() {
    return this.fareService.getConfig();
  }

  // Actualizar tarifas (solo owner — refleja cambios en la regulación ANT)
  @Patch('config')
  @Roles(UserRole.OWNER)
  setConfig(@Body() dto: SetFareConfigDto) {
    return this.fareService.setConfig(dto);
  }

  // Calcular tarifa estimada para una ruta (llamado desde la app antes de pedir el taxi)
  @Get('estimate')
  @Roles(
    UserRole.CLIENT,
    UserRole.DRIVER,
    UserRole.COOPERATIVE_ADMIN,
    UserRole.COOPERATIVE_OPERATOR,
    UserRole.OWNER,
    UserRole.PLATFORM_ADMIN,
  )
  estimate(
    @Query('origin_lat') originLat: string,
    @Query('origin_lng') originLng: string,
    @Query('dest_lat') destLat: string,
    @Query('dest_lng') destLng: string,
  ) {
    return this.fareService.estimateFare(
      parseFloat(originLat), parseFloat(originLng),
      parseFloat(destLat), parseFloat(destLng),
    );
  }
}
