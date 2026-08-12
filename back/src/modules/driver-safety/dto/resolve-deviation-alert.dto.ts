import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDeviationAlertDto {
  @IsOptional() @IsString() @MaxLength(500)
  resolution_notes?: string;
}
