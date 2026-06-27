import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { VehicleDocumentType } from '../entities/vehicle-document.entity';

export class UploadVehicleDocumentDto {
  @IsEnum(VehicleDocumentType)
  type: VehicleDocumentType;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
