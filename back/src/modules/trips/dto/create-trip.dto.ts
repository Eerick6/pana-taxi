import { IsString, IsNumber, IsOptional, IsEnum, MinLength, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { FareMode } from '../entities/trip.entity';
import { PaymentMethodSlug } from '../../payment-methods/entities/payment-method.entity';

export class CreateTripDto {
  // Opcional cuando se provee stand_id (el origen viene de la parada)
  @IsOptional()
  @IsString()
  @MinLength(3)
  origin_address?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  origin_lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  origin_lng?: number;

  @IsString()
  @MinLength(3)
  destination_address: string;

  @IsNumber()
  @Type(() => Number)
  destination_lat: number;

  @IsNumber()
  @Type(() => Number)
  destination_lng: number;

  @IsOptional()
  @IsEnum(FareMode)
  fare_mode?: FareMode;

  // Solo para modo 'negotiated': precio que ofrece el cliente
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  client_offer?: number;

  // Solo para viajes creados por cooperativa
  @IsOptional()
  @IsString()
  walk_in_client_name?: string;

  // Para viajes de cooperativa: qué cooperativa solicita
  @IsOptional()
  @IsString()
  cooperative_id?: string;

  @IsOptional()
  @IsEnum(PaymentMethodSlug)
  payment_method_slug?: PaymentMethodSlug;

  // Solo viajes cooperativos: parada como punto de partida.
  // Si se provee, el origen se toma de la parada y se despacha al primero de la cola.
  @IsOptional()
  @IsUUID()
  stand_id?: string;
}
