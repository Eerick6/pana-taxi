import {
  Controller, Post, Get, Patch, Param, Body, UseGuards,
  Query, ParseIntPipe, DefaultValuePipe, ParseUUIDPipe,
} from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { CreateVehicleRequestDto, ApplyToRequestDto } from './dto/create-vehicle-request.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('vehicle-requests')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class VehicleRequestsController {
  constructor(private readonly service: VehicleRequestsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateVehicleRequestDto) {
    return this.service.create(user.id, dto);
  }

  @Get('open')
  listOpen(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.listOpen(user.id, page, limit);
  }

  @Post(':id/apply')
  apply(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyToRequestDto,
  ) {
    return this.service.apply(id, user.id, dto);
  }

  @Patch('applications/:applicationId/withdraw')
  withdraw(@Param('applicationId', ParseUUIDPipe) appId: string, @CurrentUser() user: User) {
    return this.service.withdraw(appId, user.id);
  }

  @Get(':id/applications')
  listApplications(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.listApplications(id, user.id);
  }

  @Patch(':id/applications/:applicationId/accept')
  acceptApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) appId: string,
    @CurrentUser() user: User,
  ) {
    return this.service.acceptApplication(id, appId, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.cancel(id, user.id);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.complete(id, user.id);
  }

  @Get('mine')
  getMyRequests(@CurrentUser() user: User) {
    return this.service.getMyRequests(user.id);
  }

  @Get('my-applications')
  getMyApplications(@CurrentUser() user: User) {
    return this.service.getMyApplications(user.id);
  }
}
