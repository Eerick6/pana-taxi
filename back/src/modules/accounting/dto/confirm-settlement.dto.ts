import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmSettlementDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
