import { IsOptional, IsString, MinLength } from 'class-validator';

export class CancelTripDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
