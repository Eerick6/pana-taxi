import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('ratings')
@UseGuards(JwtGuard, RolesGuard)
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Any driver or client submits a rating after a trip or vehicle_request
  @Post()
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  create(@CurrentUser() user: User, @Body() dto: CreateRatingDto) {
    return this.ratingsService.create(user.id, user.role, dto);
  }

  // Driver stats: average from clients + average from owners who hired them
  @Get('drivers/:driverId')
  @Roles(
    UserRole.CLIENT, UserRole.DRIVER,
    UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT,
    UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_SUPERVISOR,
  )
  getDriverStats(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.ratingsService.getDriverStats(driverId);
  }

  // Owner stats: average from drivers who worked on their vehicle
  @Get('owners/:ownerId')
  @Roles(UserRole.DRIVER, UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT)
  getOwnerStats(@Param('ownerId', ParseUUIDPipe) ownerId: string) {
    return this.ratingsService.getOwnerStats(ownerId);
  }

  // Client stats: average from drivers
  @Get('clients/:clientId')
  @Roles(UserRole.DRIVER, UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT)
  getClientStats(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.ratingsService.getClientStats(clientId);
  }
}
