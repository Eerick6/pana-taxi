import { IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class AddEmergencyContactDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @Matches(/^09\d{8}$/, { message: 'Teléfono inválido. Formato: 09XXXXXXXX' })
  phone: string;

  @IsOptional()
  @IsString()
  relationship?: string;
}
