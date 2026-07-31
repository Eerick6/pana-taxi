import { IsEnum, IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';
import { RechargeMethod } from '../entities/recharge.entity';

export class RequestRechargeDto {
  @IsNumberString()
  amount: string;

  @IsEnum(RechargeMethod)
  method: RechargeMethod;

  @IsOptional() @IsUUID()
  bank_account_id?: string;

  @IsOptional() @IsString()
  driver_notes?: string;
}
