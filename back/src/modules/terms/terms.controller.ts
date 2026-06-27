import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TermsService } from './terms.service';
import { TermsType } from './entities/terms-version.entity';
import { CreateTermsVersionDto } from './dto/create-terms-version.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  // Public — mobile app fetches before registration
  @Get(':type')
  getCurrent(@Param('type') type: TermsType) {
    return this.termsService.getCurrent(type);
  }

  // Platform admin publishes new version (lawyer-reviewed text)
  @Post('publish')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN)
  publish(@Body() dto: CreateTermsVersionDto) {
    return this.termsService.publish(dto);
  }

  // Platform admin sees all versions (history)
  @Get()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN)
  getAll() {
    return this.termsService.getAll();
  }
}
