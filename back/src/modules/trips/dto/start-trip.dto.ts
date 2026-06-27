import { IsString, Length } from 'class-validator';

export class StartTripDto {
  // OTP de 4 dígitos que el cliente muestra al conductor en la app.
  // En NODE_ENV !== 'production', el código '000000' activa el bypass de desarrollo.
  @IsString()
  @Length(4, 6)
  otp_code: string;
}
