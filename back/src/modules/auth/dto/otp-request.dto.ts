import { IsString, Matches } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Teléfono inválido. Formato internacional: +593XXXXXXXXX' })
  phone: string;
}
