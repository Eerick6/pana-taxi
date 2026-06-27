import { IsNumber, IsPositive, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class MakeOfferDto {
  // Monto que el conductor ofrece. Si se omite, acepta el precio propuesto por el cliente.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;
}
