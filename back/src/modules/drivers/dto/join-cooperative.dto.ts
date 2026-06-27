import { IsUUID } from 'class-validator';

export class JoinCooperativeDto {
  @IsUUID()
  cooperative_id: string;
}
