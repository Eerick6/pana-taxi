import { IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class AddEmergencyContactDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Teléfono inválido. Formato internacional: +593XXXXXXXXX' })
  phone: string;

  @IsOptional()
  @IsString()
  relationship?: string;
}
