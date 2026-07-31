import { IsUUID, IsOptional, IsString, IsDateString, MaxLength, IsNumber } from 'class-validator';

export class CreateVehicleRequestDto {
  @IsUUID()
  vehicle_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @IsDateString()
  needed_from?: string;

  @IsOptional()
  @IsDateString()
  needed_until?: string;

  // Posición actual del taxi al publicar (para filtrar por radio)
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class ApplyToRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string; // mensaje del conductor al postularse
}

