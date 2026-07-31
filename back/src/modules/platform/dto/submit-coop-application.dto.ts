import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SubmitCoopApplicationDto {
  @IsString() @IsNotEmpty()
  cooperative_name: string;

  @IsString() @IsNotEmpty()
  @Matches(/^\d{13}$/, { message: 'El RUC debe tener 13 dígitos' })
  ruc: string;

  @IsString() @IsNotEmpty()
  representative_name: string;

  @IsEmail()
  representative_email: string;

  @IsString() @IsNotEmpty()
  representative_phone: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsString()
  driver_count?: string;

  @IsOptional() @IsString()
  notes?: string;
}
