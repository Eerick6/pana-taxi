import { IsString, MinLength } from 'class-validator';

export class RejectCooperativeDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
