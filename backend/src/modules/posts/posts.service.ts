import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostReactionType, PostType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { BlockPolicyService } from "../safety/block-policy.service";
import { RateLimitService } from "../safety/rate-limit.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { CreatePostDto } from "./dto/create-post.dto";
import { CommentsQueryDto } from "./dto/comments-query.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { ExploreQueryDto } from "./dto/explore-query.dto";

type FeedPost = Prisma.PostGetPayload<{
  include: ReturnType<PostsService["postInclude"]>;
}>;

type CommentWithUser = Prisma.PostCommentGetPayload<{
  include: {
    user: { select: { id: true; username: true } };
    children: {
      include: { user: { select: { id: true; username: true } } };
      orderBy: { createdAt: "asc" };
    };
  };
}>;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createPost(userId: string, dto: CreatePostDto) {
    const body = dto.body?.trim() ?? "";
    const media = await this.normalizeCreateMedia(userId, dto.media ?? []);
    if (!body && media.length === 0)
      throw new BadRequestException("Post body or media is required");

    const post = await this.prisma.post.create({
      data: {
        userId,
        body,
        type:
          media.length > 0
            ? body
              ? PostType.MIXED
              : PostType.MEDIA
            : PostType.TEXT,
        media: {
          create: media.map((item, index) => ({
            mediaAssetId: item.mediaAssetId,
            fileUrl: item.fileUrl,
            mimeType: item.mimeType,
            size: item.size,
            orderIndex: item.orderIndex ?? index,
          })),
        },
      },
      include: this.postInclude(userId),
    });
    await this.saveMentions(post.id, null, body, userId);

    const data = this.mapPost(post, userId);
    this.realtime.emitGlobal("post.created", data);
    return { message: "Post created", data };
  }

  async getFeed(userId: string, query: FeedQueryDto) {
    const limit = query.limit ?? 20;
    const authorWhere = {
      ...this.visibleAuthorWhere(userId),
      ...(query.scope === "following"
        ? { followers: { some: { followerId: userId } } }
        : {}),
    };
    const posts = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        ...(query.userId ? { userId: query.userId } : {}),
        user: authorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.postInclude(userId),
    });
    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;

    return {
      data: items.map((post) => this.mapPost(post, userId)),
      meta: {
        hasNextPage,
        nextCursor: hasNextPage ? items[items.length - 1]?.id : null,
      },
    };
  }

  async explore(userId: string, query: ExploreQueryDto) {
    const posts = await this.prisma.post.findMany({
      where: { deletedAt: null, user: this.visibleAuthorWhere(userId) },
      orderBy: { createdAt: "desc" },
      take: query.sort === "popular" ? 50 : (query.limit ?? 20),
      include: this.postInclude(userId),
    });

    const mapped = posts.map((post) => this.mapPost(post, userId));
    if (query.sort === "popular") {
      return mapped
        .sort(
          (a, b) =>
            b.likeCount + b.commentCount - (a.likeCount + a.commentCount),
        )
        .slice(0, query.limit ?? 20);
    }
    return mapped;
  }

  async react(userId: string, postId: string) {
    const postOwnerId = await this.assertPostExists(postId);
    await this.blockPolicy.assertCanInteract(userId, postOwnerId);
    await this.prisma.postReaction.upsert({
      where: { postId_userId: { postId, userId } },
      update: { type: PostReactionType.LIKE },
      create: { postId, userId, type: PostReactionType.LIKE },
    });

    const post = await this.prisma.post.findFirstOrThrow({
      where: { id: postId, deletedAt: null },
      include: this.postInclude(userId),
    });
    const payload = {
      postId,
      likeCount: post.reactions.length,
      userId,
      likedByMe: true,
    };
    await this.notifications.create(post.userId, userId, "post.reacted", {
      postId,
    });
    this.realtime.emitGlobal("post.reacted", payload);
    return { message: "Post liked", data: { postId, likedByMe: true } };
  }

  async unreact(userId: string, postId: string) {
    await this.assertPostExists(postId);
    await this.prisma.postReaction.deleteMany({
      where: { postId, userId },
    });

    const likeCount = await this.prisma.postReaction.count({
      where: { postId },
    });
    this.realtime.emitGlobal("post.reacted", {
      postId,
      likeCount,
      userId,
      likedByMe: false,
    });
    return { message: "Post unliked", data: { postId, likedByMe: false } };
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    const postOwnerId = await this.assertPostExists(postId);
    await this.blockPolicy.assertCanInteract(userId, postOwnerId);
    if (dto.parentId) await this.assertParentComment(postId, dto.parentId);
    const body = dto.body.trim();
    this.rateLimit.assertRateLimit("comment:create", userId, 10, 60_000);
    this.rateLimit.assertContentBurst(
      "comment:duplicate",
      userId,
      body,
      1,
      1_000,
    );
    this.rateLimit.assertContentBurst(
      "comment:content",
      userId,
      body,
      3,
      60_000,
    );

    const post = await this.prisma.post.findFirstOrThrow({
      where: { id: postId, deletedAt: null },
      select: { userId: true },
    });
    const parent = dto.parentId
      ? await this.prisma.postComment.findUnique({
          where: { id: dto.parentId },
          select: { userId: true },
        })
      : null;
    const comment = await this.prisma.postComment.create({
      data: {
        postId,
        userId,
        parentId: dto.parentId ?? null,
        body,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    });
    await this.saveMentions(postId, comment.id, body, userId);

    const data = this.mapComment({ ...comment, children: [] });
    await this.notifications.create(post.userId, userId, "post.commented", {
      postId,
      commentId: comment.id,
    });
    if (parent)
      await this.notifications.create(
        parent.userId,
        userId,
        "comment.replied",
        { postId, commentId: comment.id, parentId: dto.parentId },
      );
    const commentCount = await this.prisma.postComment.count({
      where: { postId, deletedAt: null },
    });
    this.realtime.emitGlobal("comment.created", {
      postId,
      comment: data,
      commentCount,
    });
    return { message: "Comment created", data };
  }

  async getComments(postId: string, query: CommentsQueryDto) {
    await this.assertPostExists(postId);
    const limit = query.limit ?? 5;
    const comments = await this.prisma.postComment.findMany({
      where: {
        postId,
        parentId: query.parentId ?? null, // ✅ dynamic
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true } },
        children: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 3,
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });
    const hasNextPage = comments.length > limit;
    const items = hasNextPage ? comments.slice(0, limit) : comments;

    return {
      data: items.map((comment) => this.mapComment(comment)),
      meta: {
        nextCursor: hasNextPage ? items[items.length - 1]?.id : null,
        hasNextPage,
      },
    };
  }

  private async assertPostExists(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException("Post not found");
    return post.userId;
  }

  private visibleAuthorWhere(userId: string) {
    return {
      blocksMade: { none: { blockedId: userId } },
      blocksReceived: { none: { blockerId: userId } },
    };
  }

  private async assertParentComment(postId: string, parentId: string) {
    const parent = await this.prisma.postComment.findFirst({
      where: { id: parentId, postId, parentId: null, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException("Parent comment is not valid");
  }

  private async saveMentions(
    postId: string,
    commentId: string | null,
    text: string,
    actorId: string,
  ) {
    const usernames = Array.from(
      new Set(
        Array.from(text.matchAll(/@([a-zA-Z0-9_]{3,32})/g)).map((match) =>
          match[1].toLowerCase(),
        ),
      ),
    );
    if (usernames.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: {
        username: { in: usernames },
        deletedAt: null,
        ...this.visibleAuthorWhere(actorId),
      },
      select: { id: true },
    });
    if (users.length === 0) return;

    await this.prisma.postMention.createMany({
      data: users.map((user) => ({ postId, commentId, userId: user.id })),
      skipDuplicates: true,
    });
    await Promise.all(
      users.map((user) =>
        this.notifications.create(user.id, actorId, "user.mentioned", {
          postId,
          commentId,
        }),
      ),
    );
  }

  private postInclude(userId: string) {
    return {
      user: { select: { id: true, username: true, avatarUrl: true } },
      reactions: { select: { id: true, userId: true } },
      comments: { where: { deletedAt: null }, select: { id: true } },
      media: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          mediaAssetId: true,
          fileUrl: true,
          mimeType: true,
          size: true,
          orderIndex: true,
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
              storageKey: true,
            },
          },
        },
      },
    } as const;
  }

  private mapPost(post: FeedPost, userId: string) {
    return {
      id: post.id,
      body: post.body,
      linkPreview: this.extractLinkPreview(post.body),
      createdAt: post.createdAt,
      likeCount: post.reactions.length,
      commentCount: post.comments.length,
      likedByMe: post.reactions.some((reaction) => reaction.userId === userId),
      user: post.user,
      media: post.media.map((item) => {
        const fileUrl = this.toPublicMediaUrl(item.fileUrl);
        const mediaAssetUrl = item.mediaAsset
          ? this.toPublicMediaUrl(`/uploads/${item.mediaAsset.storageKey}`)
          : null;
        return {
          id: item.id,
          mediaAssetId: item.mediaAssetId,
          mimeType: item.mimeType,
          size: item.size,
          orderIndex: item.orderIndex,
          fileUrl,
          publicUrl: mediaAssetUrl ?? fileUrl,
          mediaAsset: item.mediaAsset
            ? {
                id: item.mediaAsset.id,
                mimeType: item.mediaAsset.mimeType,
                size: item.mediaAsset.size,
                width: item.mediaAsset.width,
                height: item.mediaAsset.height,
                duration: item.mediaAsset.duration,
                thumbnailUrl: item.mediaAsset.thumbnailUrl,
                thumbnailStatus: item.mediaAsset.thumbnailStatus,
                createdAt: item.mediaAsset.createdAt,
                publicUrl: mediaAssetUrl ?? fileUrl,
              }
            : null,
        };
      }),
    };
  }

  private async normalizeCreateMedia(
    userId: string,
    media: CreatePostDto["media"],
  ) {
    const items = media ?? [];
    const mediaAssetIds = items
      .map((item) => item.mediaAssetId)
      .filter((id): id is string => Boolean(id));
    if (new Set(mediaAssetIds).size !== mediaAssetIds.length)
      throw new BadRequestException("Duplicate media assets are not allowed");

    const assets = mediaAssetIds.length
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: mediaAssetIds } },
          select: {
            id: true,
            storageKey: true,
            mimeType: true,
            size: true,
            createdBy: true,
          },
        })
      : [];
    if (assets.length !== mediaAssetIds.length)
      throw new NotFoundException("One or more media assets were not found");
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    return items.map((item, index) => {
      if (item.mediaAssetId) {
        const asset = assetsById.get(item.mediaAssetId);
        if (!asset) throw new NotFoundException("Media asset not found");
        if (asset.createdBy !== userId)
          throw new BadRequestException(
            "Cannot attach media owned by another user",
          );
        return {
          mediaAssetId: asset.id,
          fileUrl: `/uploads/${asset.storageKey}`,
          mimeType: asset.mimeType,
          size: asset.size,
          orderIndex: item.orderIndex ?? index,
        };
      }

      if (!item.fileUrl || !item.mimeType || !item.size) {
        throw new BadRequestException(
          "Legacy media requires fileUrl, mimeType, and size",
        );
      }
      return {
        mediaAssetId: undefined,
        fileUrl: item.fileUrl,
        mimeType: item.mimeType,
        size: item.size,
        orderIndex: item.orderIndex ?? index,
      };
    });
  }

  private extractLinkPreview(text: string) {
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match ? { url: match[0] } : null;
  }

  private toPublicMediaUrl(fileUrl: string) {
    if (!fileUrl) return fileUrl;
    const normalizedFileUrl = fileUrl.replace(/\\/g, "/");

    try {
      const parsed = new URL(normalizedFileUrl);

      // normalisasi legacy API path → static path
      if (parsed.pathname.startsWith("/api/uploads/")) {
        return parsed.pathname.replace("/api/uploads/", "/uploads/");
      }

      // kalau sudah /uploads → cukup return path saja
      if (parsed.pathname.startsWith("/uploads/")) {
        return parsed.pathname;
      }

      // kalau external URL (misal CDN) → biarkan
      return normalizedFileUrl;
    } catch {
      // kalau bukan URL valid → treat sebagai path
      const path = normalizedFileUrl.startsWith("/")
        ? normalizedFileUrl
        : `/${normalizedFileUrl}`;

      return path.replace("/api/uploads/", "/uploads/");
    }
  }

  private mapComment(comment: CommentWithUser) {
    return {
      id: comment.id,
      body: comment.body,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      user: comment.user,
      children:
        comment.children?.map((child) => ({
          id: child.id,
          body: child.body,
          parentId: child.parentId,
          createdAt: child.createdAt,
          user: child.user,
          children: [],
        })) ?? [],
    };
  }
}
