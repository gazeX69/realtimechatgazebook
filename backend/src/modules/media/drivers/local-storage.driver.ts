import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve } from 'path';

@Injectable()
export class LocalStorageDriver {
  private readonly rootDir = join(process.cwd(), 'uploads');

  async save(storageKey: string, buffer: Buffer) {
    const normalizedKey = normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
    const targetPath = join(this.rootDir, normalizedKey);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
    return { storageKey: normalizedKey };
  }

  stream(storageKey: string) {
    return createReadStream(this.resolveStoragePath(storageKey));
  }

  async delete(storageKey: string) {
    try {
      await unlink(this.resolveStoragePath(storageKey));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      return false;
    }
  }

  private resolveStoragePath(storageKey: string) {
    const targetPath = resolve(this.rootDir, normalize(storageKey));
    const rootPath = resolve(this.rootDir);
    if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}\\`) && !targetPath.startsWith(`${rootPath}/`)) {
      throw new Error('Invalid storage key');
    }
    return targetPath;
  }
}
