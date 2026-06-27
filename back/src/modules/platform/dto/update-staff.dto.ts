import { IsString, MinLength, IsOptional } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  full_name?: string;
}
