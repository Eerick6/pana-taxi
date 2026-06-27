import { IsString, IsInt, IsUUID, Min, Max, Matches } from 'class-validator';

export class RegisterVehicleDto {
  @IsUUID()
  cooperative_id: string;

  @IsString()
  @Matches(/^[A-Z]{3}-\d{4}$/, { message: 'Placa debe tener formato ABC-1234' })
  plate: string;

  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsString()
  color: string;

  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  year: number;
}
