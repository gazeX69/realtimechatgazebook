import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { BlockPolicyService } from '../safety/block-policy.service';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async requestFriend(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) throw new BadRequestException('Cannot send friend request to yourself');
    await this.assertUser(addresseeId);
    await this.assertCanSendFriendRequest(requesterId, addresseeId);

    const previous = await this.findFriendshipBetween(requesterId, addresseeId);
    const friendship = previous
      ? await this.prisma.friendship.update({
          where: { id: previous.id },
          data: { requesterId, addresseeId, status: FriendshipStatus.PENDING },
          select: this.friendshipSelect(),
        })
      : await this.prisma.friendship.create({
          data: { requesterId, addresseeId },
          select: this.friendshipSelect(),
        });

    await this.notifications.create(addresseeId, requesterId, 'friend.request.sent', { friendshipId: friendship.id });
    this.emitFriendEvent('friend.requested', friendship);
    return { message: 'Friend request sent', data: friendship };
  }

  async acceptRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.friendship.findFirst({
      where: { id: requestId, addresseeId: currentUserId, status: FriendshipStatus.PENDING },
      select: { id: true, requesterId: true, addresseeId: true },
    });
    if (!request) throw new NotFoundException('Friend request not found');
    await this.blockPolicy.assertCanInteract(currentUserId, request.requesterId);

    const friendship = await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: FriendshipStatus.ACCEPTED },
      select: this.friendshipSelect(),
    });
    await this.notifications.create(request.requesterId, currentUserId, 'friend.request.accepted', { friendshipId: friendship.id });
    this.emitFriendEvent('friend.accepted', friendship);
    return { message: 'Friend request accepted', data: friendship };
  }

  async rejectRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.friendship.findFirst({
      where: { id: requestId, addresseeId: currentUserId, status: FriendshipStatus.PENDING },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Friend request not found');

    const friendship = await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: FriendshipStatus.REJECTED },
      select: this.friendshipSelect(),
    });
    this.emitFriendEvent('friend.rejected', friendship);
    return { message: 'Friend request rejected', data: friendship };
  }

  private emitFriendEvent(event: 'friend.requested' | 'friend.accepted' | 'friend.rejected', friendship: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: FriendshipStatus;
  }) {
    const payload = {
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      friendshipId: friendship.id,
      status: friendship.status,
    };
    this.realtime.emitToUser(friendship.requesterId, event, payload);
    this.realtime.emitToUser(friendship.addresseeId, event, payload);
  }

  async cancelRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.friendship.findFirst({
      where: { id: requestId, requesterId: currentUserId, status: FriendshipStatus.PENDING },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Friend request not found');

    const friendship = await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: FriendshipStatus.CANCELLED },
      select: this.friendshipSelect(),
    });
    return { message: 'Friend request cancelled', data: friendship };
  }

  async removeFriend(currentUserId: string, targetUserId: string) {
    const friendship = await this.findFriendshipBetween(currentUserId, targetUserId);
    if (!friendship || friendship.status !== FriendshipStatus.ACCEPTED) throw new NotFoundException('Friendship not found');
    const updated = await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendshipStatus.CANCELLED },
      select: this.friendshipSelect(),
    });
    return { message: 'Friend removed', data: updated };
  }

  async listFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: this.friendshipSelect(),
    });
    return Promise.all(
      friendships.map(async (friendship) => {
        const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
        const lastMessage = await this.getLastDirectMessage(userId, friend.id);
        return {
          id: friend.id,
          username: friend.username,
          name: friend.displayName,
          displayName: friend.displayName,
          avatar: friend.avatarUrl,
          avatarUrl: friend.avatarUrl,
          friendshipId: friendship.id,
          lastMessage,
          canChat: !(await this.blockPolicy.isBlockedBetween(userId, friend.id)),
        };
      }),
    );
  }

  async listRequests(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { addresseeId: userId, status: FriendshipStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        select: this.friendshipSelect(),
      }),
      this.prisma.friendship.findMany({
        where: { requesterId: userId, status: FriendshipStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        select: this.friendshipSelect(),
      }),
    ]);
    return { incoming, outgoing };
  }

  async getRelationship(actorId: string, targetId: string) {
    const friendship = await this.findFriendshipBetween(actorId, targetId);
    const existingConversation = await this.hasExistingDirectConversation(actorId, targetId);
    const blocked = await this.blockPolicy.isBlockedBetween(actorId, targetId);
    if (!friendship) {
      return {
        friendshipStatus: 'none' as const,
        friendRequestId: null,
        incomingFriendRequestId: null,
        outgoingFriendRequestId: null,
        isFriend: false,
        outgoingFriendRequest: false,
        incomingFriendRequest: false,
        canChat: !blocked && existingConversation,
      };
    }

    const isPending = friendship.status === FriendshipStatus.PENDING;
    const incomingFriendRequest = isPending && friendship.addresseeId === actorId;
    const outgoingFriendRequest = isPending && friendship.requesterId === actorId;
    const isFriend = friendship.status === FriendshipStatus.ACCEPTED;

    return {
      friendshipStatus: friendship.status.toLowerCase() as 'pending' | 'accepted' | 'rejected' | 'cancelled',
      friendRequestId: friendship.id,
      incomingFriendRequestId: incomingFriendRequest ? friendship.id : null,
      outgoingFriendRequestId: outgoingFriendRequest ? friendship.id : null,
      isFriend,
      outgoingFriendRequest,
      incomingFriendRequest,
      canChat: !blocked && (isFriend || existingConversation),
    };
  }

  async isFriend(userAId: string, userBId: string) {
    const friendship = await this.findFriendshipBetween(userAId, userBId);
    return friendship?.status === FriendshipStatus.ACCEPTED;
  }

  async canSendFriendRequest(actorId: string, targetId: string) {
    if (actorId === targetId) return false;
    if (await this.blockPolicy.isBlockedBetween(actorId, targetId)) return false;
    const friendship = await this.findFriendshipBetween(actorId, targetId);
    return !friendship || friendship.status === FriendshipStatus.REJECTED || friendship.status === FriendshipStatus.CANCELLED;
  }

  async canChat(actorId: string, targetId: string) {
    if (await this.blockPolicy.isBlockedBetween(actorId, targetId)) return false;
    return (await this.isFriend(actorId, targetId)) || (await this.hasExistingDirectConversation(actorId, targetId));
  }

  async assertCanCreateDirectConversation(actorId: string, targetId: string, hasExistingConversation: boolean) {
    await this.blockPolicy.assertCanSendDirectMessage(actorId, targetId);
    if (hasExistingConversation) return;
    if (!(await this.isFriend(actorId, targetId))) {
      throw new ForbiddenException('Direct chat requires friendship');
    }
  }

  private async assertCanSendFriendRequest(actorId: string, targetId: string) {
    if (!(await this.canSendFriendRequest(actorId, targetId))) {
      throw new BadRequestException('Cannot send friend request to this user');
    }
  }

  private async findFriendshipBetween(userAId: string, userBId: string) {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userAId, addresseeId: userBId },
          { requesterId: userBId, addresseeId: userAId },
        ],
      },
      select: { id: true, requesterId: true, addresseeId: true, status: true },
    });
  }

  private async hasExistingDirectConversation(userAId: string, userBId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { directKey: this.directKey(userAId, userBId) },
      select: { id: true, deletedAt: true },
    });
    return Boolean(conversation && !conversation.deletedAt);
  }

  private async getLastDirectMessage(userAId: string, userBId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { directKey: this.directKey(userAId, userBId) },
      select: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, body: true, createdAt: true, senderId: true },
        },
      },
    });
    return conversation?.messages[0] ?? null;
  }

  private directKey(userAId: string, userBId: string) {
    return [userAId, userBId].sort().join(':');
  }

  private async assertUser(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private friendshipSelect() {
    return {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      requester: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
      addressee: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
    } as const;
  }
}
