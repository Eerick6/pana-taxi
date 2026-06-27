import { IsString, Matches, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @Matches(/^09\d{8}$/, { message: 'Teléfono inválido. Formato: 09XXXXXXXX' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos' })
  code: string;
}
