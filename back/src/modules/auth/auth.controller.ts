import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { EmailOtpRequestDto } from './dto/email-otp-request.dto';
import { EmailOtpVerifyDto } from './dto/email-otp-verify.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { RefreshDto } from './dto/refresh.dto';

class LoginPasswordDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class LoginPhoneDto {
  @IsString() @Matches(/^\+\d{7,15}$/) phone: string;
  @IsString() @MinLength(8) password: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResendInviteDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsEmail() email: string;
  @IsString() token: string;
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])/, {
    message: 'La contraseña debe tener al menos 1 mayúscula, 1 número y 1 carácter especial',
  })
  password: string;
}

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

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login/password')
  loginWithPassword(@Body() dto: LoginPasswordDto) {
    return this.authService.loginWithPassword(dto.email, dto.password);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login/phone')
  loginWithPhone(@Body() dto: LoginPhoneDto) {
    return this.authService.loginWithPhone(dto.phone, dto.password);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('password/forgot')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.token, dto.password);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('resend-invite')
  resendInvite(@Body() dto: ResendInviteDto) {
    return this.authService.resendInvite(dto.email);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('register/client')
  registerClient(@Body() dto: RegisterClientDto) {
    return this.authService.registerClient(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT)
  @Get('admin/otp-lookup')
  adminOtpLookup(@Query('phone') phone: string) {
    return this.authService.adminGetOtp(phone);
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
