import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Trip } from '../trips/entities/trip.entity';
import { VehicleRequest } from '../vehicle-requests/entities/vehicle-request.entity';
import { VehicleRequestApplication } from '../vehicle-requests/entities/vehicle-request-application.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';
import { VehicleAssignment } from '../vehicles/entities/vehicle-assignment.entity';
import { CooperativeOwner } from '../cooperatives/entities/cooperative-owner.entity';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      Trip,
      VehicleRequest,
      VehicleRequestApplication,
      CooperativeMember,
      Driver,
      Client,
      VehicleAssignment,
      CooperativeOwner,
    ]),
    GatewayModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
