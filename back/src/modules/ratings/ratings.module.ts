import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { Rating } from './entities/rating.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Rating, Driver, Client])],
  providers: [RatingsService],
  controllers: [RatingsController],
})
export class RatingsModule {}
