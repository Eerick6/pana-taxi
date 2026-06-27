import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

const PLATFORM_STAFF_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.FINANCE,
  UserRole.SUPPORT,
  UserRole.MONITORING,
] as const;

export type PlatformStaffRole = typeof PLATFORM_STAFF_ROLES[number];

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  full_name: string;

  @IsEnum(PLATFORM_STAFF_ROLES, {
    message: 'role debe ser platform_admin, finance, support o monitoring',
  })
  role: PlatformStaffRole;
}
