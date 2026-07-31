import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteTripDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  fare_amount: number;
}
