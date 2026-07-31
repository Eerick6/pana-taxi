import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price_monthly: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price_yearly?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  commission_pct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  max_drivers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  max_vehicles?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  max_stands?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
