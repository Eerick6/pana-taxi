import { IsString, MinLength } from 'class-validator';

export class RejectVehicleDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
