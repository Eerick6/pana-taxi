import { IsUUID, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

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
}
