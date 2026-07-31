import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { StandsService } from './stands.service';
import { CreateStandDto } from './dto/create-stand.dto';
import { UpdateStandDto } from './dto/update-stand.dto';
import { CheckInDto } from './dto/check-in-stand.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const ALL_COOP_ROLES = [
  UserRole.OWNER, UserRole.PLATFORM_ADMIN,
  UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR, UserRole.COOPERATIVE_SUPERVISOR,
  UserRole.SUPPORT, UserRole.MONITORING,
];

@Controller('stands')
@UseGuards(JwtGuard, RolesGuard)
export class StandsController {
  constructor(private readonly standsService: StandsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  create(@CurrentUser() user: User, @Body() dto: CreateStandDto) {
    return this.standsService.create(user, dto);
  }

  // Resumen global de paradas por cooperativa — para el dashboard de plataforma
  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.MONITORING, UserRole.SUPPORT)
  summary() {
    return this.standsService.globalSummary();
  }

  // Coop staff: returns only their coop's stands automatically
  // Platform: requires ?cooperative_id=
  @Get()
  @Roles(...ALL_COOP_ROLES, UserRole.DRIVER)
  findAll(@CurrentUser() user: User, @Query('cooperative_id') coopId?: string) {
    return this.standsService.findAll(user, coopId);
  }

  @Get('me')
  @Roles(UserRole.DRIVER)
  getMyStand(@CurrentUser() user: User) {
    return this.standsService.getMyStand(user.id);
  }

  @Get(':id')
  @Roles(...ALL_COOP_ROLES, UserRole.DRIVER)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.standsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User, @Body() dto: UpdateStandDto) {
    return this.standsService.update(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.COOPERATIVE_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.standsService.remove(id, user);
  }

  @Post('check-in')
  @Roles(UserRole.DRIVER)
  checkIn(@CurrentUser() user: User, @Body() dto: CheckInDto) {
    return this.standsService.checkIn(user.id, dto);
  }

  @Post('check-out')
  @Roles(UserRole.DRIVER)
  checkOut(@CurrentUser() user: User) {
    return this.standsService.checkOut(user.id);
  }

  @Get(':id/queue')
  @Roles(...ALL_COOP_ROLES, UserRole.DRIVER)
  getQueue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.standsService.getQueue(id, user);
  }
}
