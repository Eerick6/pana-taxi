import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PayphoneService } from './payphone.service';

class CreateLinkDto {
  trip_id: string;
}

class ConfirmPaymentDto {
  payphone_id: number;
  client_tx_id: string;
  trip_id: string;
}

@Controller('payphone')
@UseGuards(JwtGuard)
export class PayphoneController {
  constructor(private readonly service: PayphoneService) {}

  @Post('link')
  async createLink(@Req() req, @Body() body: CreateLinkDto) {
    const url = await this.service.createLink(body.trip_id, req.user.sub);
    return { url };
  }

  @Post('confirm')
  async confirmPayment(@Req() req, @Body() body: ConfirmPaymentDto) {
    const success = await this.service.confirmPayment(
      body.payphone_id,
      body.client_tx_id,
      body.trip_id,
      req.user.sub,
    );
    return { success };
  }
}
