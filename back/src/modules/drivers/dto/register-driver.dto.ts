import { IsString, IsEnum, IsOptional, IsDateString, IsUUID, Matches, MinLength } from 'class-validator';
import { DriverType } from '../entities/driver.entity';

export class RegisterDriverDto {
  @IsString()
  @MinLength(3)
  full_name: string;

  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Teléfono inválido. Formato internacional: +593XXXXXXXXX' })
  phone: string;

  @IsEnum(DriverType)
  driver_type: DriverType;

  @IsOptional()
  @IsString()
  license_number?: string;

  @IsOptional()
  @IsDateString()
  license_expiry?: string;

  @IsString()
  terms_version: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])/, {
    message: 'La contraseña debe tener al menos 1 mayúscula, 1 número y 1 carácter especial',
  })
  password: string;
}
