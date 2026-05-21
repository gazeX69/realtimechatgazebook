import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FriendshipStatus, Prisma, StoryVisibility } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStoryDto, CreateStoryItemDto } from "./dto/create-story.dto";
import { ReactStoryDto } from "./dto/react-story.dto";

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

type StoryWithRelations = Prisma.StoryGetPayload<{
  include: ReturnType<StoriesService["storyInclude"]>;
}>;

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateStoryDto) {
    const isLegacySingleStoryCreate =
      !dto.items?.length && Boolean(dto.mediaAssetId);
    const items = this.normalizeCreateItems(dto);
    const mediaAssetIds = items.map((item) => item.mediaAssetId);
    const uniqueMediaAssetIds = Array.from(new Set(mediaAssetIds));
    if (uniqueMediaAssetIds.length !== mediaAssetIds.length) {
      throw new BadRequestException("Story media items must be unique");
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: uniqueMediaAssetIds } },
      select: {
        id: true,
        mimeType: true,
        createdBy: true,
      },
    });
    if (assets.length !== uniqueMediaAssetIds.length) {
      throw new NotFoundException("Media asset not found");
    }
    for (const asset of assets) {
      if (asset.createdBy !== userId) {
        throw new BadRequestException(
          "Cannot create story with media owned by another user",
        );
      }
      if (!this.isStoryMedia(asset.mimeType)) {
        throw new BadRequestException("Stories support image and video only");
      }
    }

    const expiresAt = new Date(Date.now() + STORY_LIFETIME_MS);
    const visibility = dto.visibility ?? StoryVisibility.FOLLOWERS;
    const fallbackCaption = dto.caption?.trim() || null;

    const stories = await this.prisma.$transaction(async (tx) => {
      const storyGroup = await tx.storyGroup.create({
        data: { userId },
        select: { id: true },
      });

      await tx.story.createMany({
        data: items.map((item) => ({
          userId,
          groupId: storyGroup.id,
          mediaAssetId: item.mediaAssetId,
          caption: item.caption?.trim() || fallbackCaption,
          orderIndex: item.orderIndex,
          visibility,
          expiresAt,
        })),
      });

      return tx.story.findMany({
        where: { groupId: storyGroup.id },
        orderBy: [{ createdAt: "asc" }, { orderIndex: "asc" }, { id: "asc" }],
        include: this.storyInclude(userId),
      });
    });

    if (isLegacySingleStoryCreate) {
      return {
        message: "Story created",
        data: this.mapStory(stories[0], userId),
      };
    }

    return {
      message: "Stories created",
      data: this.mapUserBuckets(stories, userId)[0],
    };
  }

  async feed(userId: string) {
    const stories = await this.prisma.story.findMany({
      where: this.activeStoryWhere(userId),
      orderBy: [{ createdAt: "asc" }, { orderIndex: "asc" }, { id: "asc" }],
      include: this.storyInclude(userId),
    });

    return { data: this.mapUserBuckets(stories, userId) };
  }

  async get(userId: string, storyId: string) {
    const story = await this.findActiveStory(userId, storyId);
    return { data: this.mapStory(story, userId) };
  }

  async seen(userId: string, storyId: string) {
    await this.findActiveStory(userId, storyId);
    const view = await this.prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      update: { seenAt: new Date() },
      create: { storyId, userId },
    });

    return {
      message: "Story marked as seen",
      data: { storyId, seenAt: view.seenAt },
    };
  }

  async react(userId: string, storyId: string, dto: ReactStoryDto) {
    await this.findActiveStory(userId, storyId);
    const reaction = await this.prisma.storyReaction.upsert({
      where: {
        storyId_userId_emoji: {
          storyId,
          userId,
          emoji: dto.emoji,
        },
      },
      update: { updatedAt: new Date() },
      create: { storyId, userId, emoji: dto.emoji },
      select: { storyId: true, emoji: true, createdAt: true },
    });

    return { message: "Story reaction saved", data: reaction };
  }

  async delete(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!story) throw new NotFoundException("Story not found");
    if (story.userId !== userId)
      throw new ForbiddenException("Story owner only");

    await this.prisma.story.update({
      where: { id: storyId },
      data: { deletedAt: new Date() },
    });

    return { message: "Story deleted", data: { id: storyId } };
  }

  private async findActiveStory(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, ...this.activeStoryWhere(userId) },
      include: this.storyInclude(userId),
    });
    if (!story) throw new NotFoundException("Story not found");
    return story;
  }

  private activeStoryWhere(userId: string): Prisma.StoryWhereInput {
    return {
      deletedAt: null,
      expiresAt: { gt: new Date() },
      user: this.visibleAuthorWhere(userId),
      OR: [
        { userId },
        {
          visibility: {
            in: [StoryVisibility.FOLLOWERS, StoryVisibility.PUBLIC],
          },
          user: {
            followers: { some: { followerId: userId } },
          },
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
    };
  }

  private visibleAuthorWhere(userId: string): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      blocksMade: { none: { blockedId: userId } },
      blocksReceived: { none: { blockerId: userId } },
    };
  }

  private storyInclude(userId: string) {
    return Prisma.validator<Prisma.StoryInclude>()({
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      group: { select: { id: true, createdAt: true } },
      mediaAsset: {
        select: {
          id: true,
          mimeType: true,
          size: true,
          width: true,
          height: true,
          duration: true,
          thumbnailUrl: true,
          thumbnailStatus: true,
          createdAt: true,
        },
      },
      views: {
        where: { userId },
        select: { userId: true, seenAt: true },
      },
    });
  }

  private mapStory(story: StoryWithRelations, userId: string) {
    const ownView = story.views.find((view) => view.userId === userId);
    return {
      id: story.id,
      groupId: story.groupId,
      mediaAssetId: story.mediaAssetId,
      caption: story.caption,
      orderIndex: story.orderIndex,
      visibility: story.visibility,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      user: this.mapUser(story.user),
      mediaAsset: story.mediaAsset,
      seenByMe: Boolean(ownView),
      seenAt: ownView?.seenAt ?? null,
    };
  }

  private mapUserBuckets(stories: StoryWithRelations[], userId: string) {
    const buckets = new Map<
      string,
      {
        user: StoryWithRelations["user"];
        latestStoryAt: Date;
        hasUnseen: boolean;
        stories: ReturnType<StoriesService["mapStory"]>[];
      }
    >();

    for (const story of stories) {
      const mapped = this.mapStory(story, userId);
      const current = buckets.get(story.userId);
      const latestStoryAt = current
        ? new Date(
            Math.max(
              current.latestStoryAt.getTime(),
              story.createdAt.getTime(),
            ),
          )
        : story.createdAt;
      if (current) {
        current.stories.push(mapped);
        current.latestStoryAt = latestStoryAt;
        current.hasUnseen = current.hasUnseen || !mapped.seenAt;
      } else {
        buckets.set(story.userId, {
          user: story.user,
          latestStoryAt,
          hasUnseen: !mapped.seenAt,
          stories: [mapped],
        });
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => {
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
        return b.latestStoryAt.getTime() - a.latestStoryAt.getTime();
      })
      .map((bucket) => ({
        user: this.mapUser(bucket.user),
        hasUnseen: bucket.hasUnseen,
        latestStoryAt: bucket.latestStoryAt,
        stories: bucket.stories,
      }));
  }

  private normalizeCreateItems(dto: CreateStoryDto): CreateStoryItemDto[] {
    if (dto.items?.length) {
      return dto.items.map((item, index) => ({
        mediaAssetId: item.mediaAssetId,
        caption: item.caption,
        orderIndex: item.orderIndex ?? index,
      }));
    }
    if (dto.mediaAssetId) {
      return [{ mediaAssetId: dto.mediaAssetId, orderIndex: 0 }];
    }
    throw new BadRequestException("At least one story media item is required");
  }

  private mapUser(user: StoryWithRelations["user"]) {
    return {
      id: user.id,
      username: user.username,
      name: user.displayName ?? null,
      avatarUrl: user.avatarUrl,
    };
  }

  private isStoryMedia(mimeType: string) {
    return mimeType.startsWith("image/") || mimeType.startsWith("video/");
  }
}
