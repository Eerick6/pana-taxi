import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const ADMIN_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT];

@Controller('clients')
@UseGuards(JwtGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // ── Perfil propio ────────────────────────────────────────────────────────────

  @Get('me')
  @Roles(UserRole.CLIENT)
  getMyProfile(@CurrentUser() user: User) {
    return this.clientsService.getMyProfile(user.id);
  }

  @Patch('me')
  @Roles(UserRole.CLIENT)
  updateMyProfile(@CurrentUser() user: User, @Body() dto: UpdateClientDto) {
    return this.clientsService.updateMyProfile(user.id, dto);
  }

  @Post('me/photo')
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File) {
    return this.clientsService.uploadPhoto(user.id, file);
  }

  // ── Contactos de emergencia ──────────────────────────────────────────────────

  @Post('me/emergency-contacts')
  @Roles(UserRole.CLIENT)
  addEmergencyContact(@CurrentUser() user: User, @Body() dto: AddEmergencyContactDto) {
    return this.clientsService.addEmergencyContact(user.id, dto);
  }

  @Get('me/emergency-contacts')
  @Roles(UserRole.CLIENT)
  getEmergencyContacts(@CurrentUser() user: User) {
    return this.clientsService.getEmergencyContacts(user.id);
  }

  @Delete('me/emergency-contacts/:id')
  @Roles(UserRole.CLIENT)
  removeEmergencyContact(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) contactId: string,
  ) {
    return this.clientsService.removeEmergencyContact(user.id, contactId);
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  @Get()
  @Roles(...ADMIN_ROLES)
  listClients(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.clientsService.listClients(page, limit, search);
  }

  @Get(':id')
  @Roles(...ADMIN_ROLES)
  getClientById(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getClientById(id);
  }

  @Patch(':id/block')
  @Roles(...ADMIN_ROLES)
  blockClient(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.blockClient(id);
  }

  @Patch(':id/unblock')
  @Roles(...ADMIN_ROLES)
  unblockClient(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.unblockClient(id);
  }
}
