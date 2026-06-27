import { IsString, Matches, MinLength } from 'class-validator';
import { IsCedula } from '../../../common/validators/cedula.validator';

export class RegisterClientDto {
  @IsString()
  @Matches(/^09\d{8}$/, { message: 'Teléfono inválido. Formato: 09XXXXXXXX' })
  phone: string;

  @IsString()
  @MinLength(3)
  full_name: string;

  @IsCedula()
  cedula: string;

  @IsString()
  terms_version: string;
}
