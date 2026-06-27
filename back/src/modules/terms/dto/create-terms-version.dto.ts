import { IsEnum, IsString, MinLength } from 'class-validator';
import { TermsType } from '../entities/terms-version.entity';

export class CreateTermsVersionDto {
  @IsString()
  version: string;

  @IsEnum(TermsType)
  type: TermsType;

  @IsString()
  @MinLength(100)
  content: string;
}
