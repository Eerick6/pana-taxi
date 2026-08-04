import { IsNumber, Min } from 'class-validator';

export class SetOfferDto {
  @IsNumber()
  @Min(0)
  amount: number;
}
