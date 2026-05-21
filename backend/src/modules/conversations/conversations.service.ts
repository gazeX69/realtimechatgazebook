import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { ConversationType, FriendshipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { BlockPolicyService } from '../safety/block-policy.service';
import { RateLimitService } from '../safety/rate-limit.service';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { RenameGroupConversationDto } from './dto/rename-group-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly rateLimit: RateLimitService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtime: RealtimeService,
  ) {}

  async createOrFindDirectConversation(currentUserId: string, participantId: string) {
    if (currentUserId === participantId) {
      throw new BadRequestException('Cannot create direct conversation with yourself');
    }

    const participant = await this.prisma.user.findFirst({
      where: { id: participantId, deletedAt: null },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('Participant not found');

    const directKey = this.directKey(currentUserId, participantId);
    const existingConversation = await this.prisma.conversation.findUnique({
      where: { directKey },
      select: { id: true, deletedAt: true },
    });
    const hasActiveConversation = Boolean(existingConversation && !existingConversation.deletedAt);
    await this.assertCanCreateDirectConversation(currentUserId, participantId, hasActiveConversation);

    const conversation = await this.prisma.conversation.upsert({
      where: { directKey },
      update: {},
      create: {
        type: ConversationType.DIRECT,
        directKey,
        participants: {
          createMany: {
            data: [{ userId: currentUserId }, { userId: participantId }],
          },
        },
      },
      include: this.conversationInclude(),
    });
    if (!hasActiveConversation) this.emitOnlinePresenceBetweenParticipants([currentUserId, participantId]);

    return { message: 'Conversation ready', data: conversation };
  }

  async createGroupConversation(currentUserId: string, dto: CreateGroupConversationDto) {
    this.rateLimit.assertRateLimit('group:create', currentUserId, 5, 60_000);
    const name = dto.name.trim();
    const memberIds = Array.from(new Set(dto.memberIds)).filter((id) => id !== currentUserId);
    if (memberIds.length < 1) {
      throw new BadRequestException('Group requires at least one other member');
    }

    const members = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, deletedAt: null },
      select: { id: true },
    });
    if (members.length !== memberIds.length) {
      throw new NotFoundException('One or more group members were not found');
    }

    await Promise.all(
      memberIds.map((memberId) =>
        this.assertCanInviteGroupMember(currentUserId, memberId),
      ),
    );

    const creatorJoinedAt = new Date();
    const memberJoinedAt = new Date(creatorJoinedAt.getTime() + 1);
    const participantIds = [currentUserId, ...memberIds];
    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name,
        ownerId: currentUserId,
        participants: {
          createMany: {
            data: participantIds.map((userId) => ({
              userId,
              joinedAt: userId === currentUserId ? creatorJoinedAt : memberJoinedAt,
            })),
          },
        },
      },
      include: this.conversationInclude(),
    });
    this.emitOnlinePresenceBetweenParticipants(participantIds);

    return { message: 'Group conversation created', data: conversation };
  }

  async renameGroupConversation(currentUserId: string, conversationId: string, dto: RenameGroupConversationDto) {
    await this.assertActiveGroupParticipant(conversationId, currentUserId);
    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { name: dto.name.trim() },
      include: this.conversationInclude(),
    });

    return { message: 'Group renamed', data: conversation };
  }

  async addGroupMember(currentUserId: string, conversationId: string, memberId: string) {
    this.rateLimit.assertRateLimit('group:add-member', `${currentUserId}:${conversationId}`, 10, 60_000);
    await this.assertActiveGroupParticipant(conversationId, currentUserId);
    if (memberId === currentUserId) throw new BadRequestException('You are already a group member');

    const user = await this.prisma.user.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    await this.assertCanInviteGroupMember(currentUserId, memberId);

    const existingParticipant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: memberId } },
      select: { id: true, leftAt: true },
    });
    if (existingParticipant && !existingParticipant.leftAt) {
      throw new BadRequestException('User is already a group member');
    }

    if (existingParticipant) {
      await this.prisma.conversationParticipant.update({
        where: { id: existingParticipant.id },
        data: { leftAt: null, joinedAt: new Date() },
      });
    } else {
      await this.prisma.conversationParticipant.create({
        data: { conversationId, userId: memberId },
      });
    }

    const conversation = await this.getConversationForResponse(conversationId);
    this.emitOnlinePresenceBetweenParticipants(conversation.participants.map((participant) => participant.userId));
    return { message: 'Group member added', data: conversation };
  }

  async removeGroupMember(currentUserId: string, conversationId: string, memberId: string) {
    this.rateLimit.assertRateLimit('group:remove-member', `${currentUserId}:${conversationId}`, 10, 60_000);
    await this.assertGroupOwner(conversationId, currentUserId);
    const ownerId = await this.getGroupOwnerId(conversationId);
    if (memberId === ownerId) throw new BadRequestException('Group owner cannot be removed');

    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: memberId,
        leftAt: null,
        conversation: { type: ConversationType.GROUP, deletedAt: null },
      },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('Group member not found');

    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
    this.realtime.removeUserFromConversation(memberId, conversationId);

    const conversation = await this.getConversationForResponse(conversationId);
    return { message: 'Group member removed', data: conversation };
  }

  async transferGroupOwner(currentUserId: string, conversationId: string, targetUserId: string) {
    this.rateLimit.assertRateLimit('group:transfer-owner', `${currentUserId}:${conversationId}`, 6, 60_000);
    await this.assertGroupOwner(conversationId, currentUserId);
    if (currentUserId === targetUserId) throw new BadRequestException('You are already the group owner');

    await this.assertActiveGroupParticipant(conversationId, targetUserId);
    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { ownerId: targetUserId },
      include: this.conversationInclude(),
    });

    return { message: 'Group owner transferred', data: conversation };
  }

  async leaveGroup(currentUserId: string, conversationId: string) {
    this.rateLimit.assertRateLimit('group:leave', currentUserId, 10, 60_000);
    await this.assertActiveGroupParticipant(conversationId, currentUserId);
    const ownerId = await this.getGroupOwnerId(conversationId);
    const isOwner = currentUserId === ownerId;
    const activeParticipantCount = await this.prisma.conversationParticipant.count({
      where: { conversationId, leftAt: null, conversation: { type: ConversationType.GROUP, deletedAt: null } },
    });
    if (isOwner && activeParticipantCount > 1) {
      throw new BadRequestException('Transfer group ownership before leaving');
    }

    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      data: { leftAt: new Date() },
    });
    if (isOwner) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { deletedAt: new Date() },
      });
    }
    this.realtime.removeUserFromConversation(currentUserId, conversationId);

    return { message: 'Left group', data: { conversationId } };
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        deletedAt: null,
        participants: { some: { userId, leftAt: null } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: this.conversationInclude(),
    });
    return Promise.all(
      conversations.map(async (conversation) => {
        const peer = conversation.participants.find((participant) => participant.userId !== userId);
        const isGroup = conversation.type === ConversationType.GROUP;
        const relationship = !isGroup && peer
          ? await this.blockPolicy.relationship(userId, peer.userId)
          : { isBlockedByMe: false, hasBlockedMe: false, canInteract: true };
        const isFriend = !isGroup && peer ? await this.isFriend(userId, peer.userId) : true;
        return {
          ...conversation,
          lastMessage: conversation.messages[0] ?? null,
          unreadCount: await this.unreadCount(conversation.id, userId),
          isBlockedByMe: relationship.isBlockedByMe,
          hasBlockedMe: relationship.hasBlockedMe,
          canInteract: relationship.canInteract,
          isFriend,
          canChat: relationship.canInteract,
        };
      }),
    );
  }

  async markAllRead(conversationId: string, userId: string) {
    return this.markMessagesRead(conversationId, userId);
  }

  async markMessagesRead(conversationId: string, userId: string, messageIds?: string[]) {
    await this.assertActiveParticipant(conversationId, userId);
    const where = {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        reads: { none: { userId } },
        ...(messageIds?.length ? { id: { in: messageIds } } : {}),
    };
    const unreadMessages = await this.prisma.message.findMany({
      where,
      select: { id: true },
    });
    const readMessageIds = unreadMessages.map((message) => message.id);

    for (const messageId of readMessageIds) {
      await this.prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { readAt: new Date() },
        create: { messageId, userId },
      });
    }

    if (readMessageIds.length > 0) {
      this.realtime.emitToConversation(conversationId, 'message.read', {
        conversationId,
        messageIds: readMessageIds,
        readerId: userId,
      });
    }

    return { conversationId, readerId: userId, messageIds: readMessageIds, readCount: readMessageIds.length };
  }

  async assertActiveParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId, leftAt: null, conversation: { deletedAt: null } },
    });
    if (!participant) throw new ForbiddenException('You are not a participant of this conversation');
    return participant;
  }

  async getDirectPeerId(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
        participants: { some: { userId, leftAt: null } },
      },
      select: {
        type: true,
        participants: {
          where: { leftAt: null },
          select: { userId: true },
        },
      },
    });
    if (!conversation) throw new ForbiddenException('You are not a participant of this conversation');
    if (conversation.type !== ConversationType.DIRECT) return null;
    return conversation.participants.find((participant) => participant.userId !== userId)?.userId ?? null;
  }

  async listPeerUserIds(userId: string) {
    const peers = await this.prisma.conversationParticipant.findMany({
      where: {
        userId: { not: userId },
        leftAt: null,
        conversation: {
          deletedAt: null,
          participants: {
            some: {
              userId,
              leftAt: null,
            },
          },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return peers.map((peer) => peer.userId);
  }

  private async assertActiveGroupParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        leftAt: null,
        conversation: { type: ConversationType.GROUP, deletedAt: null },
      },
      select: { id: true },
    });
    if (!participant) throw new ForbiddenException('You are not a group participant');
    return participant;
  }

  private async assertGroupOwner(conversationId: string, userId: string) {
    const ownerId = await this.getGroupOwnerId(conversationId);
    if (ownerId !== userId) throw new ForbiddenException('Only the group owner can manage members');
  }

  private async assertCanInviteGroupMember(actorId: string, targetId: string) {
    await this.blockPolicy.assertCanInteract(actorId, targetId);
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { allowGroupInvite: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.allowGroupInvite === 'nobody') {
      throw new ForbiddenException('This user does not allow group invites');
    }
    if (!(await this.isFriend(actorId, targetId))) {
      throw new ForbiddenException('Group invite requires friendship');
    }
  }

  private async getGroupOwnerId(conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, type: ConversationType.GROUP, deletedAt: null },
      select: {
        ownerId: true,
        participants: {
          where: { leftAt: null },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { userId: true },
        },
      },
    });
    if (!conversation?.participants[0]) throw new NotFoundException('Group conversation not found');
    return conversation.ownerId ?? conversation.participants[0].userId;
  }

  private async getConversationForResponse(conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      include: this.conversationInclude(),
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private directKey(a: string, b: string) {
    return [a, b].sort().join(':');
  }

  private unreadCount(conversationId: string, userId: string) {
    return this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        reads: { none: { userId } },
      },
    });
  }

  private async assertCanCreateDirectConversation(actorId: string, targetId: string, hasExistingConversation: boolean) {
    await this.blockPolicy.assertCanSendDirectMessage(actorId, targetId);
    if (hasExistingConversation) return;
    if (!(await this.isFriend(actorId, targetId))) {
      throw new ForbiddenException('Direct chat requires friendship');
    }
  }

  private async isFriend(userAId: string, userBId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [
          { requesterId: userAId, addresseeId: userBId },
          { requesterId: userBId, addresseeId: userAId },
        ],
      },
      select: { id: true },
    });
    return Boolean(friendship);
  }

  private emitOnlinePresenceBetweenParticipants(userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds));
    uniqueUserIds.forEach((onlineUserId) => {
      if (!this.realtime.isUserOnline(onlineUserId)) return;
      uniqueUserIds
        .filter((peerId) => peerId !== onlineUserId)
        .forEach((peerId) => {
          this.realtime.emitToUser(peerId, 'user.online', { userId: onlineUserId });
        });
    });
  }

  private conversationInclude() {
    return {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      messages: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.MessageOrderByWithRelationInput[],
        take: 1,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    } as const;
  }
}
