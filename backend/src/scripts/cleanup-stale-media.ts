import { PrismaService } from '../prisma/prisma.service';
import { BlockPolicyService } from '../modules/safety/block-policy.service';
import { LocalStorageDriver } from '../modules/media/drivers/local-storage.driver';
import { MediaService } from '../modules/media/media.service';
import { StorageService } from '../modules/media/storage.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const storage = new StorageService(new LocalStorageDriver());
  const media = new MediaService(prisma, storage, new BlockPolicyService(prisma));
  const hours = Number(process.env.MEDIA_STALE_HOURS ?? 24);
  const limit = Number(process.env.MEDIA_CLEANUP_LIMIT ?? 100);
  const dryRun = process.env.MEDIA_CLEANUP_DRY_RUN === 'true';
  const result = await media.cleanupStaleMediaAssets({
    olderThanMs: hours * 60 * 60 * 1000,
    limit,
    dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
