import { IsUUID, IsOptional } from 'class-validator';

export class CheckInDto {
  @IsUUID()
  stand_id: string;

  @IsOptional() @IsUUID()
  vehicle_id?: string;
}
