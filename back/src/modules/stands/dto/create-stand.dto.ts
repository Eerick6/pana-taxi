import {
  IsString, IsNotEmpty, IsOptional, IsNumber,
  IsUUID, IsInt, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStandDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsOptional() @IsString()
  address?: string;

  @Type(() => Number) @IsNumber()
  lat: number;

  @Type(() => Number) @IsNumber()
  lng: number;

  // Required for PLATFORM_ADMIN/OWNER. Coop staff ignores this — se infiere de su membresía.
  @IsOptional() @IsUUID()
  cooperative_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  capacity?: number;
}
