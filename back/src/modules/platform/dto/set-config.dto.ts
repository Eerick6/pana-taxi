import { IsString, IsOptional, MinLength } from 'class-validator';

export class SetConfigDto {
  @IsString()
  @MinLength(1)
  value: string;

  @IsOptional()
  @IsString()
  description?: string;
}
