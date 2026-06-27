import {
  IsString, IsNotEmpty, IsOptional, IsNumber,
  IsUUID, IsInt, Min, Max, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStandDto {
  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  lng?: number;

  @IsOptional() @IsUUID()
  cooperative_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  capacity?: number;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}
