import {
  Controller,
  Get,
  Post,
  Patch,
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
import { WalletService } from './wallet.service';
import { RequestRechargeDto } from './dto/request-recharge.dto';
import { RejectRechargeDto } from './dto/reject-recharge.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

const FINANCE_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE];

@Controller('wallet')
@UseGuards(JwtGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── Driver: su propio wallet ─────────────────────────────────────────────────

  @Get('me')
  @Roles(UserRole.DRIVER)
  getMyWallet(@CurrentUser() user: User) {
    return this.walletService.getMyWallet(user.id);
  }

  @Get('me/transactions')
  @Roles(UserRole.DRIVER)
  getMyTransactions(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getMyTransactions(user.id, page, limit);
  }

  @Get('me/recharges')
  @Roles(UserRole.DRIVER)
  getMyRecharges(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getMyRecharges(user.id, page, limit);
  }

  @Post('me/recharges')
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FileInterceptor('proof'))
  requestRecharge(
    @CurrentUser() user: User,
    @Body() dto: RequestRechargeDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.walletService.requestRecharge(user.id, dto, file);
  }

  // ── Finance: gestión de recargas ─────────────────────────────────────────────

  @Get('recharges/pending')
  @Roles(...FINANCE_ROLES)
  listPendingRecharges(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.listPendingRecharges(page, limit);
  }

  @Get('recharges/:id/proof-url')
  @Roles(...FINANCE_ROLES)
  getRechargeProofUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.walletService.getRechargeProofUrl(id);
  }

  @Patch('recharges/:id/confirm')
  @Roles(...FINANCE_ROLES)
  confirmRecharge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.walletService.confirmRecharge(id, user);
  }

  @Patch('recharges/:id/reject')
  @Roles(...FINANCE_ROLES)
  rejectRecharge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectRechargeDto) {
    return this.walletService.rejectRecharge(id, dto);
  }
}
