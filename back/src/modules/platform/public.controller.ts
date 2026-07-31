import { Body, Controller, Post, Get } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { SubmitCoopApplicationDto } from './dto/submit-coop-application.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('config')
  getPublicConfig() {
    return this.platformService.getPublicConfig();
  }

  @Post('contact')
  submitContact(@Body() dto: SubmitLeadDto) {
    return this.platformService.submitLead(dto);
  }

  @Post('cooperative-apply')
  submitCoopApplication(@Body() dto: SubmitCoopApplicationDto) {
    return this.platformService.submitCoopApplication(dto);
  }
}
