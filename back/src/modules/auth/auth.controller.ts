import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { EmailOtpRequestDto } from './dto/email-otp-request.dto';
import { EmailOtpVerifyDto } from './dto/email-otp-verify.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('otp/request')
  requestPhoneOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestPhoneOtp(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('otp/verify')
  verifyPhoneOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyPhoneOtp(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('email-otp/request')
  requestEmailOtp(@Body() dto: EmailOtpRequestDto) {
    return this.authService.requestEmailOtp(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('email-otp/verify')
  verifyEmailOtp(@Body() dto: EmailOtpVerifyDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Post('register/client')
  registerClient(@Body() dto: RegisterClientDto) {
    return this.authService.registerClient(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.authService.getMe(user.id, user.role);
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  logout(@CurrentUser() user: User) {
    return this.authService.logout(user.id);
  }
}
