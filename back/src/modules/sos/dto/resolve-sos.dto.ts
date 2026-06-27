import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveSosDto {
  @IsOptional() @IsString() @MaxLength(500)
  resolution_notes?: string;
}
