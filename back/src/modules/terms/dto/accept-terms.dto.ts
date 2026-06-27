import { IsEnum, IsString } from 'class-validator';
import { TermsType } from '../entities/terms-version.entity';

export class AcceptTermsDto {
  @IsEnum(TermsType)
  type: TermsType;

  @IsString()
  version: string;
}
