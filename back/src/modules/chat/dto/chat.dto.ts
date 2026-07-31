import { IsUUID, IsString, MaxLength, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ConversationType } from '../entities/conversation.entity';

export class SendMessageDto {
  @IsUUID()
  conversation_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}

// Para abrir una conversación driver↔operadora (el driver la inicia con su coop)
export class OpenOperatorConversationDto {
  @IsUUID()
  cooperative_id: string;
}

// Para abrir chat driver↔dueño desde una solicitud de vehículo aceptada
export class OpenOwnerConversationDto {
  @IsUUID()
  vehicle_request_id: string;
}

// Para abrir chat dueño↔postulante desde una postulación (antes de aceptar)
export class OpenApplicantConversationDto {
  @IsUUID()
  application_id: string;
}
