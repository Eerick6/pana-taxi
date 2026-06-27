import { IsOptional, IsNumber, IsUUID, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class TriggerSosDto {
  @IsOptional() @Type(() => Number) @IsNumber()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  lng?: number;

  @IsOptional() @IsUUID()
  trip_id?: string;

  @IsOptional() @IsString() @MaxLength(500)
  message?: string;
}
