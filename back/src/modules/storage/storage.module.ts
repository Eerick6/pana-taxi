import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';

@Module({
  providers: [StorageService, LocalStorageService],
  exports: [StorageService, LocalStorageService],
})
export class StorageModule {}
