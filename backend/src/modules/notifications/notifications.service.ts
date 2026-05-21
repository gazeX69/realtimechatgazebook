import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RateLimitService } from '../safety/rate-limit.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async create(
    userId: string,
    actorId: string,
    type: string,
    data: Record<string, unknown>,
  ) {
    if (userId === actorId) return null;
    if (!this.rateLimit.isAllowed('notification:create', actorId, 30, 60_000)) return null;
    const targetLimit = type === 'message.new' ? 60 : 10;
    if (!this.rateLimit.isAllowed('notification:target', `${actorId}:${userId}:${type}`, targetLimit, 60_000)) return null;
    const entityId = this.resolveEntityId(type, data);
    const payload = { ...data, actorId };

    try {
      const notification = await this.prisma.notification.create({
        data: { userId, actorId, type, entityId, data: payload },
      });
      this.realtime.emitToUser(
        userId,
        'notification.new',
        this.mapNotification(notification),
      );
      return notification;
    } catch (error) {
      if (!this.isUniqueConstraintError(error) || !entityId) throw error;

      return this.prisma.notification.findUnique({
        where: {
          userId_actorId_type_entityId: {
            userId,
            actorId,
            type,
            entityId,
          },
        },
      });
    }
  }

  async list(userId: string, query: ListNotificationsDto) {
    const limit = query.limit ?? 20;
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = notifications.length > limit;
    const items = hasNextPage ? notifications.slice(0, limit) : notifications;

    return {
      data: items.map((notification) => this.mapNotification(notification)),
      meta: {
        hasNextPage,
        nextCursor: hasNextPage ? items[items.length - 1]?.id : null,
      },
    };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    return { updated: notification.count };
  }

  async markAllRead(userId: string) {
    const notification = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: notification.count };
  }

  private resolveEntityId(type: string, data: Record<string, unknown>) {
    const entityKeysByType: Record<string, string[]> = {
      'post.commented': ['commentId'],
      'comment.replied': ['commentId'],
      'friend.request.sent': ['friendshipId'],
      'friend.request.accepted': ['friendshipId'],
      'user.followed': ['targetUserId'],
      'message.new': ['messageId'],
    };
    const keys = entityKeysByType[type] ?? [
      'postId',
      'commentId',
      'targetUserId',
      'friendshipId',
    ];
    const candidate = keys
      .map((key) => data[key])
      .find((value) => typeof value === 'string');

    return typeof candidate === 'string' ? candidate : null;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private mapNotification(notification: {
    id: string;
    userId: string;
    type: string;
    data: unknown;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
