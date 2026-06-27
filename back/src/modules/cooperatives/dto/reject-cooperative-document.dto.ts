import { IsString, MinLength } from 'class-validator';

export class RejectCooperativeDocumentDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
