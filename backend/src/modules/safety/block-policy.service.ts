import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type RelationshipState = {
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
  canInteract: boolean;
};

@Injectable()
export class BlockPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlockedBetween(userAId: string, userBId: string) {
    if (userAId === userBId) return false;
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  async relationship(actorId: string, targetId: string): Promise<RelationshipState> {
    if (actorId === targetId) {
      return { isBlockedByMe: false, hasBlockedMe: false, canInteract: true };
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: actorId, blockedId: targetId },
          { blockerId: targetId, blockedId: actorId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    const isBlockedByMe = blocks.some((block) => block.blockerId === actorId && block.blockedId === targetId);
    const hasBlockedMe = blocks.some((block) => block.blockerId === targetId && block.blockedId === actorId);
    return { isBlockedByMe, hasBlockedMe, canInteract: !isBlockedByMe && !hasBlockedMe };
  }

  async canInteractWithUser(actorId: string, targetId: string) {
    return !(await this.isBlockedBetween(actorId, targetId));
  }

  async canSendDirectMessage(senderId: string, receiverId: string) {
    return this.canInteractWithUser(senderId, receiverId);
  }

  async assertCanInteract(actorId: string, targetId: string) {
    if (actorId === targetId) return;
    const canInteract = await this.canInteractWithUser(actorId, targetId);
    if (!canInteract) throw new ForbiddenException('Interaction is restricted between these users');
  }

  async assertCanSendDirectMessage(senderId: string, receiverId: string) {
    const canSend = await this.canSendDirectMessage(senderId, receiverId);
    if (!canSend) throw new ForbiddenException('Cannot send message because interaction is restricted');
  }

  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) throw new BadRequestException('Cannot block yourself');
    await this.assertUser(blockedId);

    const block = await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: { reason: reason?.trim() || undefined },
      create: { blockerId, blockedId, reason: reason?.trim() || null },
      select: this.blockSelect(),
    });

    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });
    await this.prisma.friendship.updateMany({
      where: {
        OR: [
          { requesterId: blockerId, addresseeId: blockedId },
          { requesterId: blockedId, addresseeId: blockerId },
        ],
        status: { in: [FriendshipStatus.PENDING, FriendshipStatus.ACCEPTED] },
      },
      data: { status: FriendshipStatus.CANCELLED },
    });

    return { message: 'User blocked', data: block };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException('Cannot unblock yourself');
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { message: 'User unblocked', data: { blockedId } };
  }

  async listBlocks(blockerId: string) {
    return this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      select: this.blockSelect(),
    });
  }

  private async assertUser(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private blockSelect() {
    return {
      id: true,
      blockerId: true,
      blockedId: true,
      reason: true,
      createdAt: true,
      blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    } as const;
  }
}
