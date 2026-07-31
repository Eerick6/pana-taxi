import { IsString, Matches, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Teléfono inválido. Formato internacional: +593XXXXXXXXX' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos' })
  code: string;
}
