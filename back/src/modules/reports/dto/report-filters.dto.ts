import { IsOptional, IsDateString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFiltersDto {
  @IsOptional() @IsDateString()
  from?: string; // ISO date string, ej: 2026-06-01

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsUUID()
  cooperative_id?: string;

  @IsOptional() @IsUUID()
  driver_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}
