import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { CreateVehicleRequestDto } from './dto/create-vehicle-request.dto';
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

  // Owner posts a "need a driver" request
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateVehicleRequestDto) {
    return this.service.create(user.id, dto);
  }

  // Owner sees their own requests
  @Get('mine')
  getMyRequests(@CurrentUser() user: User) {
    return this.service.getMyRequests(user.id);
  }

  // Driver sees their accepted jobs
  @Get('accepted')
  getMyAccepted(@CurrentUser() user: User) {
    return this.service.getMyAccepted(user.id);
  }

  // Drivers with LOOKING_FOR_WORK status browse open requests
  @Get('open')
  listOpen(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.listOpen(page, limit);
  }

  // Driver accepts an open request
  @Patch(':id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.accept(id, user.id);
  }

  // Owner cancels their request
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.cancel(id, user.id);
  }

  // Owner marks the job as done
  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.complete(id, user.id);
  }
}
