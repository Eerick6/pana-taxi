import { IsString, Matches } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  @Matches(/^09\d{8}$/, { message: 'Teléfono inválido. Formato: 09XXXXXXXX' })
  phone: string;
}
