import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteTripDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fare_amount: number;
}
