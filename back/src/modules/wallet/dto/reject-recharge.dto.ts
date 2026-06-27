import { IsString, MinLength } from 'class-validator';

export class RejectRechargeDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
