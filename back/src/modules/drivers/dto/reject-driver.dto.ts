import { IsString, MinLength } from 'class-validator';

export class RejectDriverDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
