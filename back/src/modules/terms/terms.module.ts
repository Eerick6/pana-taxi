import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsService } from './terms.service';
import { TermsController } from './terms.controller';
import { TermsVersion } from './entities/terms-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TermsVersion])],
  providers: [TermsService],
  controllers: [TermsController],
  exports: [TermsService],
})
export class TermsModule {}
