import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { BlockPolicyService } from '../safety/block-policy.service';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly friends: FriendsService,
    private readonly realtime: RealtimeService,
  ) {}

  async follow(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) throw new BadRequestException('Cannot follow yourself');
    await this.assertUser(targetUserId);
    await this.blockPolicy.assertCanInteract(currentUserId, targetUserId);
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: currentUserId, followingId: targetUserId } },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.follow.create({
        data: { followerId: currentUserId, followingId: targetUserId },
      });
      await this.notifications.create(targetUserId, currentUserId, 'user.followed', { targetUserId });
      this.emitFollowEvent('user.followed', currentUserId, targetUserId);
    }
    return { following: true };
  }

  async unfollow(currentUserId: string, targetUserId: string) {
    const result = await this.prisma.follow.deleteMany({
      where: { followerId: currentUserId, followingId: targetUserId },
    });
    if (result.count > 0) this.emitFollowEvent('user.unfollowed', currentUserId, targetUserId);
    return { following: false };
  }

  private emitFollowEvent(event: 'user.followed' | 'user.unfollowed', followerId: string, targetUserId: string) {
    const payload = { followerId, targetUserId };
    this.realtime.emitToUser(followerId, event, payload);
    this.realtime.emitToUser(targetUserId, event, payload);
  }

  async followers(userId: string) {
    await this.assertUser(userId);
    return this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      include: { follower: { select: this.publicUserSelect() } },
    });
  }

  async following(userId: string) {
    await this.assertUser(userId);
    return this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { following: { select: this.publicUserSelect() } },
    });
  }

  async profile(currentUserId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        ...this.publicUserSelect(),
        _count: { select: { followers: true, following: true, posts: true } },
        followers: { where: { followerId: currentUserId }, select: { id: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const relationship = await this.blockPolicy.relationship(currentUserId, userId);
    const friendRelationship = await this.friends.getRelationship(currentUserId, userId);
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      postCount: user._count.posts,
      followedByMe: user.followers.length > 0,
      isBlockedByMe: relationship.isBlockedByMe,
      hasBlockedMe: relationship.hasBlockedMe,
      canInteract: relationship.canInteract,
      ...friendRelationship,
    };
  }

  private async assertUser(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private publicUserSelect() {
    return {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
    } as const;
  }
}
