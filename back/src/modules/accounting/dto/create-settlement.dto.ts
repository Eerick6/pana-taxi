import { IsUUID, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSettlementDto {
  @IsUUID()
  cooperative_id: string;

  @IsDateString()
  period_from: string;

  @IsDateString()
  period_to: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
