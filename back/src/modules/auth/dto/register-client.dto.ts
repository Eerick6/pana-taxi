import { IsString, Matches, MinLength } from 'class-validator';
import { IsCedula } from '../../../common/validators/cedula.validator';

export class RegisterClientDto {
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Teléfono inválido. Formato internacional: +593XXXXXXXXX' })
  phone: string;

  @IsString()
  @MinLength(3)
  full_name: string;

  @IsCedula()
  cedula: string;

  @IsString()
  terms_version: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])/, {
    message: 'La contraseña debe tener al menos 1 mayúscula, 1 número y 1 carácter especial',
  })
  password: string;
}
