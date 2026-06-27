import { IsEmail, IsString, Length } from 'class-validator';

export class EmailOtpVerifyDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos' })
  code: string;
}
