import { IsEnum, IsString, MinLength, IsOptional } from 'class-validator';
import { AccountType } from '../entities/bank-account.entity';

export class CreateBankAccountDto {
  @IsString() @MinLength(2)
  bank_name: string;

  @IsString() @MinLength(5)
  account_number: string;

  @IsString() @MinLength(3)
  account_holder: string;

  @IsEnum(AccountType)
  account_type: AccountType;

  @IsOptional() @IsString()
  id_number?: string;

  @IsOptional() @IsString()
  logo_url?: string;

  @IsOptional() @IsString()
  notes?: string;
}
