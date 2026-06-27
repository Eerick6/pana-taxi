import {
  Controller, Post, Delete, Get, Patch, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterFcmTokenDto } from './dto/register-token.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('notifications')
@UseGuards(JwtGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('token')
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  registerToken(@CurrentUser() user: User, @Body() dto: RegisterFcmTokenDto) {
    return this.notificationsService.registerToken(user.id, dto.token);
  }

  @Delete('token')
  @Roles(UserRole.CLIENT, UserRole.DRIVER)
  removeToken(@CurrentUser() user: User) {
    return this.notificationsService.removeToken(user.id);
  }

  // ── Feed ───────────────────────────────────────────────────────────────────

  @Get('me')
  @Roles(UserRole.CLIENT, UserRole.DRIVER, UserRole.OWNER, UserRole.COOPERATIVE_ADMIN)
  getMyNotifications(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.getMyNotifications(user.id, page, limit);
  }

  @Get('me/unread-count')
  @Roles(UserRole.CLIENT, UserRole.DRIVER, UserRole.OWNER, UserRole.COOPERATIVE_ADMIN)
  getUnreadCount(@CurrentUser() user: User) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  @Roles(UserRole.CLIENT, UserRole.DRIVER, UserRole.OWNER, UserRole.COOPERATIVE_ADMIN)
  markRead(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Patch('read-all')
  @Roles(UserRole.CLIENT, UserRole.DRIVER, UserRole.OWNER, UserRole.COOPERATIVE_ADMIN)
  markAllRead(@CurrentUser() user: User) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Delete(':id')
  @Roles(UserRole.CLIENT, UserRole.DRIVER, UserRole.OWNER, UserRole.COOPERATIVE_ADMIN)
  deleteNotification(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.deleteNotification(id, user.id);
  }
}
