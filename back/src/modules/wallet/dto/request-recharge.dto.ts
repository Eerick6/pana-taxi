import { IsEnum, IsNumberString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RechargeMethod } from '../entities/recharge.entity';

export class RequestRechargeDto {
  @IsNumberString()
  amount: string;

  @IsEnum(RechargeMethod)
  method: RechargeMethod;
}
