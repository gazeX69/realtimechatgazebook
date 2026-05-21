import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import {
  ConversationType,
  FriendshipStatus,
  StoryVisibility,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { BlockPolicyService } from "../safety/block-policy.service";
import { StorageService } from "./storage.service";

type UploadedMediaFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  pdf: 15 * 1024 * 1024,
};

const THUMBNAIL_TIMEOUT_MS = 6_000;
let ffmpegAvailability: Promise<boolean> | null = null;
let thumbnailColumnSupport: Promise<boolean> | null = null;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly blockPolicy: BlockPolicyService,
  ) {}

  async upload(userId: string, file: UploadedMediaFile | undefined) {
    if (!file) throw new BadRequestException("File is required");

    const category = this.categoryFor(file.mimetype);
    if (!category) throw new BadRequestException("Unsupported media type");

    const maxSize = SIZE_LIMITS[category];
    if (file.size > maxSize)
      throw new BadRequestException(
        `Maximum ${category} file size is ${Math.floor(maxSize / 1024 / 1024)}MB`,
      );

    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const storageKey = `media/${randomUUID()}${this.extensionFor(file.originalname, file.mimetype)}`;
    const saved = await this.storage.save(storageKey, file.buffer);
    const supportsThumbnails = await this.supportsThumbnailColumns();
    const thumbnail = supportsThumbnails
      ? await this.safeCreateThumbnail(file.buffer, file.mimetype)
      : { url: null, status: null, storageKey: null };

    try {
      return await this.prisma.mediaAsset.create({
        data: {
          storageKey: saved.storageKey,
          mimeType: file.mimetype,
          size: file.size,
          ...(supportsThumbnails
            ? {
                thumbnailUrl: thumbnail.url,
                thumbnailStatus: thumbnail.status,
              }
            : {}),
          checksum,
          createdBy: userId,
        },
        select: this.mediaAssetSelect(supportsThumbnails),
      });
    } catch (error) {
      if (thumbnail.storageKey) await this.storage.delete(thumbnail.storageKey);
      throw error;
    }
  }

  async getAuthorizedMedia(userId: string, mediaId: string) {
    const supportsThumbnails = await this.supportsThumbnailColumns();
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      select: this.mediaAssetSelect(supportsThumbnails),
    });
    if (!asset) throw new NotFoundException("Media asset not found");
    if (!(await this.canAccessMedia(userId, asset)))
      throw new ForbiddenException("Media access denied");

    return {
      asset,
      stream: this.storage.stream(asset.storageKey),
    };
  }

  async canAccessMedia(
    userId: string,
    asset: { id: string; createdBy: string },
  ) {
    const linkedConversation = await this.prisma.messageAttachment.findFirst({
      where: {
        mediaAssetId: asset.id,
        message: {
          deletedAt: null,
          conversation: {
            deletedAt: null,
            participants: { some: { userId, leftAt: null } },
          },
        },
      },
      select: {
        message: {
          select: {
            senderId: true,
            conversation: {
              select: {
                type: true,
                participants: {
                  where: { leftAt: null },
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!linkedConversation) {
      const linkedStory = await this.prisma.story.findFirst({
        where: {
          mediaAssetId: asset.id,
          deletedAt: null,
          expiresAt: { gt: new Date() },
          user: {
            deletedAt: null,
            blocksMade: { none: { blockedId: userId } },
            blocksReceived: { none: { blockerId: userId } },
          },
          OR: [
            { userId },
            {
              visibility: {
                in: [StoryVisibility.FOLLOWERS, StoryVisibility.PUBLIC],
              },
              user: { followers: { some: { followerId: userId } } },
            },
            {
              visibility: StoryVisibility.FRIENDS,
              user: {
                OR: [
                  {
                    sentFriendRequests: {
                      some: {
                        addresseeId: userId,
                        status: FriendshipStatus.ACCEPTED,
                      },
                    },
                  },
                  {
                    receivedFriendRequests: {
                      some: {
                        requesterId: userId,
                        status: FriendshipStatus.ACCEPTED,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
        select: { id: true },
      });
      if (linkedStory) return true;

      const hasMessageAttachment =
        await this.prisma.messageAttachment.findFirst({
          where: { mediaAssetId: asset.id },
          select: { id: true },
        });
      return hasMessageAttachment ? false : asset.createdBy === userId;
    }

    if (
      linkedConversation.message.conversation.type === ConversationType.DIRECT
    ) {
      const peerId = linkedConversation.message.conversation.participants.find(
        (participant) => participant.userId !== userId,
      )?.userId;
      if (peerId && (await this.blockPolicy.isBlockedBetween(userId, peerId)))
        return false;
    }

    return true;
  }

  async listAttachableMedia(userId: string, mediaIds: string[]) {
    return this.prisma.mediaAsset.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, createdBy: true },
    });
  }

  async cleanupStaleMediaAssets(options: {
    olderThanMs: number;
    limit?: number;
    dryRun?: boolean;
  }) {
    const cutoff = new Date(Date.now() - options.olderThanMs);
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        createdAt: { lt: cutoff },
        messageAttachments: { none: {} },
        postMedia: { none: {} },
        stories: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 100,
      select: {
        id: true,
        storageKey: true,
        thumbnailUrl: true,
        createdAt: true,
      },
    });

    if (options.dryRun)
      return { scanned: assets.length, deleted: 0, failed: 0, assets };

    let deleted = 0;
    let failed = 0;
    for (const asset of assets) {
      const fileDeleted = await this.storage.delete(asset.storageKey);
      if (!fileDeleted) {
        failed += 1;
        continue;
      }
      const thumbnailStorageKey = this.storageKeyFromUploadUrl(
        asset.thumbnailUrl,
      );
      if (thumbnailStorageKey) await this.storage.delete(thumbnailStorageKey);
      await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
      deleted += 1;
    }

    return { scanned: assets.length, deleted, failed };
  }

  private categoryFor(mimeType: string): keyof typeof SIZE_LIMITS | null {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "pdf";
    return null;
  }

  private mediaAssetSelect(includeThumbnailFields: boolean) {
    return {
      id: true,
      storageKey: true,
      mimeType: true,
      size: true,
      width: true,
      height: true,
      duration: true,
      ...(includeThumbnailFields
        ? { thumbnailUrl: true, thumbnailStatus: true }
        : {}),
      checksum: true,
      createdBy: true,
      createdAt: true,
    } as const;
  }

  private supportsThumbnailColumns() {
    thumbnailColumnSupport ??= this.prisma
      .$queryRawUnsafe<Array<{ column_name: string }>>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'media_assets' AND column_name IN ('thumbnail_url', 'thumbnail_status')",
      )
      .then((columns) => {
        const names = new Set(columns.map((column) => column.column_name));
        const supported =
          names.has("thumbnail_url") && names.has("thumbnail_status");
        if (!supported && process.env.NODE_ENV !== "production") {
          console.warn(
            "[media] thumbnail columns unavailable; upload will skip thumbnail metadata",
          );
        }
        return supported;
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[media] thumbnail column check failed", error);
        }
        return false;
      });
    return thumbnailColumnSupport;
  }

  private async safeCreateThumbnail(buffer: Buffer, mimeType: string) {
    try {
      return await this.createThumbnail(buffer, mimeType);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[media] thumbnail step skipped after error", error);
      }
      return { url: null, status: "failed", storageKey: null };
    }
  }

  private async createThumbnail(buffer: Buffer, mimeType: string) {
    if (!mimeType.startsWith("video/")) {
      return { url: null, status: null, storageKey: null };
    }

    if (!(await this.isFfmpegAvailable())) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[media] video thumbnail skipped: ffmpeg is unavailable");
      }
      return { url: null, status: "unavailable", storageKey: null };
    }

    try {
      const thumbnailBuffer = await this.generateVideoThumbnail(
        buffer,
        mimeType,
      );
      const storageKey = `media/thumbnails/${randomUUID()}.jpg`;
      const saved = await this.storage.save(storageKey, thumbnailBuffer);
      return {
        url: `/uploads/${saved.storageKey}`,
        status: "ready",
        storageKey: saved.storageKey,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[media] video thumbnail generation failed", error);
      }
      return { url: null, status: "failed", storageKey: null };
    }
  }

  private isFfmpegAvailable() {
    ffmpegAvailability ??= new Promise<boolean>((resolve) => {
      const child = spawn("ffmpeg", ["-version"], {
        windowsHide: true,
        stdio: "ignore",
      });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
    return ffmpegAvailability;
  }

  private async generateVideoThumbnail(buffer: Buffer, mimeType: string) {
    const workspace = await mkdtemp(join(tmpdir(), "media-thumb-"));
    const inputPath = join(
      workspace,
      `input${this.thumbnailInputExt(mimeType)}`,
    );
    const outputPath = join(workspace, "thumbnail.jpg");

    try {
      await writeFile(inputPath, buffer);
      await this.runFfmpeg([
        "-y",
        "-ss",
        "00:00:01",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(480,iw)':-2",
        "-q:v",
        "5",
        outputPath,
      ]);
      return await readFile(outputPath);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const child = spawn("ffmpeg", args, {
        windowsHide: true,
        stdio: "ignore",
      });
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("ffmpeg thumbnail timeout"));
      }, THUMBNAIL_TIMEOUT_MS);

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code ?? "unknown"}`));
      });
    });
  }

  private thumbnailInputExt(mimeType: string) {
    if (mimeType === "video/mp4") return ".mp4";
    if (mimeType === "video/webm") return ".webm";
    if (mimeType === "video/quicktime") return ".mov";
    if (mimeType === "video/x-matroska") return ".mkv";
    return ".video";
  }

  private storageKeyFromUploadUrl(url?: string | null) {
    if (!url) return null;
    const normalized = url.replace(/\\/g, "/");
    if (!normalized.startsWith("/uploads/")) return null;
    return normalized.slice("/uploads/".length);
  }

  private extensionFor(originalName: string, mimeType: string) {
    const originalExt = extname(originalName);
    if (originalExt) return originalExt.toLowerCase();
    if (mimeType === "application/pdf") return ".pdf";
    if (mimeType === "image/png") return ".png";
    if (mimeType === "image/webp") return ".webp";
    if (mimeType === "image/gif") return ".gif";
    if (mimeType === "video/webm") return ".webm";
    if (mimeType === "audio/mpeg") return ".mp3";
    return ".bin";
  }
}
