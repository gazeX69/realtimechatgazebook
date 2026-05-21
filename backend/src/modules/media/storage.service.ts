import { Injectable } from '@nestjs/common';
import { LocalStorageDriver } from './drivers/local-storage.driver';

@Injectable()
export class StorageService {
  constructor(private readonly local: LocalStorageDriver) {}

  save(storageKey: string, buffer: Buffer) {
    return this.local.save(storageKey, buffer);
  }

  stream(storageKey: string) {
    return this.local.stream(storageKey);
  }

  delete(storageKey: string) {
    return this.local.delete(storageKey);
  }
}
