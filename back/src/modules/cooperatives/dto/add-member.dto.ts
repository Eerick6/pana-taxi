import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { CooperativeMemberRole } from '../entities/cooperative-member.entity';

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  full_name: string;

  @IsEnum(CooperativeMemberRole)
  role: CooperativeMemberRole;
}
