import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FriendshipStatus, Prisma, StoryVisibility } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MediaService } from "../media/media.service";
import { ConversationsService } from "../conversations/conversations.service";
import { RealtimeService } from "../realtime/realtime.service";
import { BlockPolicyService } from "../safety/block-policy.service";
import { RateLimitService } from "../safety/rate-limit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ListMessagesDto } from "./dto/list-messages.dto";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly rateLimit: RateLimitService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesDto,
  ) {
    await this.conversations.assertActiveParticipant(conversationId, userId);
    const limit = query.limit ?? 30;
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.messageInclude(),
    });
    const hasNextPage = messages.length > limit;
    const items = hasNextPage ? messages.slice(0, limit) : messages;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return {
      data: [...items].reverse(),
      meta: {
        hasNextPage,
        nextCursor,
      },
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    await this.conversations.assertActiveParticipant(conversationId, userId);
    const peerId = await this.conversations.getDirectPeerId(
      conversationId,
      userId,
    );
    if (peerId)
      await this.blockPolicy.assertCanSendDirectMessage(userId, peerId);
    const body = dto.body?.trim() ?? "";
    const attachmentIds = dto.attachmentIds ?? [];
    if (!body && attachmentIds.length === 0)
      throw new BadRequestException("Message body or attachment is required");
    this.rateLimit.assertRateLimit("message:send", userId, 12, 10_000);
    if (body) {
      this.rateLimit.assertContentBurst(
        "message:duplicate",
        userId,
        body,
        1,
        750,
      );
      this.rateLimit.assertContentBurst(
        "message:content",
        userId,
        body,
        3,
        30_000,
      );
    }
    await this.assertAttachableMedia(userId, attachmentIds);
    const metadata = dto.storyReference
      ? await this.storyReplyMetadata(userId, dto.storyReference.storyId)
      : undefined;
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body,
        metadata,
        attachments: {
          create: attachmentIds.map((mediaAssetId, orderIndex) => ({
            mediaAssetId,
            orderIndex,
          })),
        },
      },
      include: this.messageInclude(),
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    const emittedAt = new Date().toISOString();
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[realtime] message created id=${message.id} at=${message.createdAt.toISOString()} emitAt=${emittedAt}`,
      );
    }
    const messagePayload = {
      ...message,
      clientMessageId: dto.clientMessageId,
    };
    this.realtime.emitToConversation(
      conversationId,
      "message.sent",
      messagePayload,
    );
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null, userId: { not: userId } },
      select: { userId: true },
    });
    const payload = {
      conversationId,
      message: {
        id: message.id,
        body: message.body,
        metadata: message.metadata,
        createdAt: message.createdAt,
        clientMessageId: dto.clientMessageId,
        attachments: message.attachments,
      },
      sender: message.sender,
      timestamp: message.createdAt,
      emittedAt,
    };
    participants.forEach((participant) => {
      this.realtime.emitToUser(participant.userId, "message.new", payload);
      void this.notifications.create(
        participant.userId,
        userId,
        "message.new",
        {
          conversationId,
          messageId: message.id,
        },
      );
    });
    return { message: "Message sent", data: messagePayload };
  }

  async deleteMessageForEveryone(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    await this.conversations.assertActiveParticipant(conversationId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
      select: { id: true, senderId: true },
    });
    if (!message) throw new NotFoundException("Message not found");
    if (message.senderId !== userId)
      throw new ForbiddenException("Only the sender can delete this message");

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    this.realtime.emitToConversation(conversationId, "message.deleted", {
      conversationId,
      messageId,
    });
    return { message: "Message deleted", data: { conversationId, messageId } };
  }

  private async assertAttachableMedia(userId: string, attachmentIds: string[]) {
    if (attachmentIds.length === 0) return;
    const uniqueIds = new Set(attachmentIds);
    if (uniqueIds.size !== attachmentIds.length)
      throw new BadRequestException("Duplicate attachments are not allowed");

    const assets = await this.media.listAttachableMedia(userId, attachmentIds);
    if (assets.length !== attachmentIds.length)
      throw new NotFoundException("One or more attachments were not found");
    const foreignAsset = assets.find((asset) => asset.createdBy !== userId);
    if (foreignAsset)
      throw new ForbiddenException("Cannot attach media owned by another user");
  }

  private messageInclude() {
    return {
      sender: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      reads: {
        select: {
          userId: true,
          readAt: true,
        },
      },
      attachments: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
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
            },
          },
        },
      },
      metadata: true,
    } as const;
  }

  private async storyReplyMetadata(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: {
        id: storyId,
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
      select: {
        id: true,
        userId: true,
        mediaAssetId: true,
        caption: true,
      },
    });
    if (!story) throw new NotFoundException("Story not found");
    return {
      storyReply: {
        storyId: story.id,
        storyOwnerId: story.userId,
        mediaAssetId: story.mediaAssetId,
        caption: story.caption,
      },
    } satisfies Prisma.InputJsonObject;
  }
}
