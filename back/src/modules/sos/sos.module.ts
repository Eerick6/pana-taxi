import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SosService } from './sos.service';
import { SosController } from './sos.controller';
import { SosAlert } from './entities/sos-alert.entity';
import { Client } from '../clients/entities/client.entity';
import { EmergencyContact } from '../clients/entities/emergency-contact.entity';
import { User } from '../users/entities/user.entity';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SosAlert, Client, EmergencyContact, User]),
    GatewayModule,
  ],
  providers: [SosService],
  controllers: [SosController],
})
export class SosModule {}
