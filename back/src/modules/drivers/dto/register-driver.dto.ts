import { IsString, IsEnum, IsOptional, IsDateString, IsUUID, Matches, MinLength } from 'class-validator';
import { DriverType } from '../entities/driver.entity';

export class RegisterDriverDto {
  @IsString()
  @MinLength(3)
  full_name: string;

  @IsString()
  @Matches(/^09\d{8}$/, { message: 'Teléfono inválido. Formato: 09XXXXXXXX' })
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
}
