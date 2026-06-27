import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { RatingDirection } from '../entities/rating.entity';

export class CreateRatingDto {
  @IsEnum(RatingDirection)
  direction: RatingDirection;

  // Provide trip_id for trip-based ratings, vehicle_request_id for owner→driver ratings
  @IsOptional()
  @IsUUID()
  trip_id?: string;

  @IsOptional()
  @IsUUID()
  vehicle_request_id?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
