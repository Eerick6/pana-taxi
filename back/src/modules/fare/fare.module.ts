import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FareService } from './fare.service';
import { FareController } from './fare.controller';
import { FareConfig } from './entities/fare-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FareConfig])],
  providers: [FareService],
  controllers: [FareController],
  exports: [FareService],
})
export class FareModule {}
