import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('audit')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE, UserRole.SUPPORT)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  query(@Query() filters: QueryAuditDto) {
    return this.auditService.query(filters);
  }
}
