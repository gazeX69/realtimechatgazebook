import { Module } from '@nestjs/common';
import { SafetyModule } from '../safety/safety.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { StorageService } from './storage.service';

@Module({
  imports: [SafetyModule],
  controllers: [MediaController],
  providers: [MediaService, StorageService, LocalStorageDriver],
  exports: [MediaService],
})
export class MediaModule {}
