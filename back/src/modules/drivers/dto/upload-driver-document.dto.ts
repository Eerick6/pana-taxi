import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { DriverDocumentType } from '../entities/driver-document.entity';

export class UploadDriverDocumentDto {
  @IsEnum(DriverDocumentType)
  type: DriverDocumentType;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
