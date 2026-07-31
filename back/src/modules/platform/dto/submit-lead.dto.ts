import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  cooperative: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  driver_count_range?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
