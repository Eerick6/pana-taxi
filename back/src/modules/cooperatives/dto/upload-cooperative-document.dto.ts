import { IsEnum } from 'class-validator';
import { CooperativeDocumentType } from '../entities/cooperative-document.entity';

export class UploadCooperativeDocumentDto {
  @IsEnum(CooperativeDocumentType)
  type: CooperativeDocumentType;
}
