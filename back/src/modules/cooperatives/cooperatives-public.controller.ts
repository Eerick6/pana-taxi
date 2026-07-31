import { Controller, Post, Body } from '@nestjs/common';
import { CooperativesService } from './cooperatives.service';

@Controller('cooperatives')
export class CooperativesPublicController {
  constructor(private readonly cooperativesService: CooperativesService) {}

  @Post('register')
  registerPublic(
    @Body() dto: {
      name: string;
      ruc: string;
      address?: string;
      phone?: string;
      admin_name: string;
      admin_email: string;
    },
  ) {
    return this.cooperativesService.registerPublic(dto);
  }
}
