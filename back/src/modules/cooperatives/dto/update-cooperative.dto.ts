import { IsString, IsOptional, Matches, IsNumber, Min, Max, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCooperativeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{13}$/, { message: 'El RUC debe tener 13 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commission_override?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthly_fee_override?: number;
}
