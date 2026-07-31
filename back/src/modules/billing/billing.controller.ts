import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { InvoiceStatus } from './entities/invoice.entity';
import { PaymentStatus } from './entities/billing-payment.entity';

@Controller('billing')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ── Invoices ─────────────────────────────────────────────────────────────────

  @Get('invoices')
  findInvoices(
    @Query('status') status?: InvoiceStatus,
    @Query('cooperative_id') cooperative_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.findInvoices({
      status,
      cooperative_id,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch('invoices/:id/mark-paid')
  markInvoicePaid(@Param('id') id: string) {
    return this.billingService.markInvoicePaid(id);
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  @Get('payments')
  findPayments(
    @Query('status') status?: PaymentStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.findPayments({
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch('payments/:id/confirm')
  confirmPayment(@Param('id') id: string) {
    return this.billingService.confirmPayment(id);
  }

  @Patch('payments/:id/reject')
  rejectPayment(@Param('id') id: string) {
    return this.billingService.rejectPayment(id);
  }

  // ── Renewals & Stats ──────────────────────────────────────────────────────────

  @Get('renewals')
  getRenewals() {
    return this.billingService.getRenewals();
  }

  @Get('stats')
  getStats() {
    return this.billingService.getStats();
  }
}
