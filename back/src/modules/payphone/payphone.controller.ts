import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PayphoneService } from './payphone.service';

class CreateLinkDto {
  trip_id: string;
}

class ConfirmPaymentDto {
  payphone_id: number;
  client_tx_id: string;
  trip_id: string;
  card_token?: string;
}

class ChargeWithTokenDto {
  trip_id: string;
}

@Controller('payphone')
@UseGuards(JwtGuard)
export class PayphoneController {
  constructor(private readonly service: PayphoneService) {}

  @Post('link')
  async createLink(@Req() req, @Body() body: CreateLinkDto) {
    return this.service.createLink(body.trip_id, req.user.sub);
  }

  @Get('estimate/:tripId')
  async estimate(@Req() req, @Param('tripId') tripId: string) {
    return this.service.estimateCardCharge(tripId, req.user.sub);
  }

  @Post('confirm')
  async confirmPayment(@Req() req, @Body() body: ConfirmPaymentDto) {
    const success = await this.service.confirmPayment(
      body.payphone_id,
      body.client_tx_id,
      body.trip_id,
      req.user.sub,
      body.card_token,
    );
    return { success };
  }

  @Get('has-token')
  async hasToken(@Req() req) {
    const has_token = await this.service.hasCardToken(req.user.sub);
    return { has_token };
  }

  @Post('charge-with-token')
  async chargeWithToken(@Req() req, @Body() body: ChargeWithTokenDto) {
    const success = await this.service.chargeWithToken(body.trip_id, req.user.sub);
    return { success };
  }
}
