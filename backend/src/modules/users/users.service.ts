import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { BlockPolicyService } from '../safety/block-policy.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockPolicy: BlockPolicyService,
    private readonly friends: FriendsService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: this.publicUserSelect(),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const username = dto.username?.trim().toLowerCase();
    if (username) {
      const existing = await this.prisma.user.findFirst({
        where: { username, id: { not: userId }, deletedAt: null },
        select: { id: true },
      });
      if (existing) throw new BadRequestException('Username already taken');
    }
    const avatarUrl = dto.avatarUrl?.trim();
    const localAvatarPath = avatarUrl ? this.normalizeLocalAvatarPath(avatarUrl) : avatarUrl;
    if (avatarUrl && !localAvatarPath) throw new BadRequestException('Avatar must be uploaded through the app');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(username ? { username } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: localAvatarPath || null } : {}),
        ...(dto.allowGroupInvite !== undefined ? { allowGroupInvite: dto.allowGroupInvite } : {}),
      },
      select: this.publicUserSelect(),
    });
    return { message: 'Profile updated successfully', data: user };
  }

  async listUsers(currentUserId: string) {
    const users = await this.prisma.user.findMany({
      where: { id: { not: currentUserId }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        ...this.publicUserSelect(),
        followers: { where: { followerId: currentUserId }, select: { id: true } },
      },
    });
    return Promise.all(users.map((user) => this.mapDiscoveryUser(currentUserId, user)));
  }

  async searchUsers(currentUserId: string, query: string) {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        deletedAt: null,
        OR: [
          { username: { contains: trimmed, mode: 'insensitive' } },
          { displayName: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        ...this.publicUserSelect(),
        followers: { where: { followerId: currentUserId }, select: { id: true } },
      },
    });

    return Promise.all(users.map((user) => this.mapDiscoveryUser(currentUserId, user)));
  }

  async suggestedUsers(currentUserId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        deletedAt: null,
        followers: { none: { followerId: currentUserId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        ...this.publicUserSelect(),
        followers: { where: { followerId: currentUserId }, select: { id: true } },
      },
    });

    return Promise.all(users.map((user) => this.mapDiscoveryUser(currentUserId, user)));
  }

  private async mapDiscoveryUser(currentUserId: string, user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    followers: { id: string }[];
  }) {
    const relationship = await this.blockPolicy.relationship(currentUserId, user.id);
    const friendRelationship = await this.friends.getRelationship(currentUserId, user.id);
    return {
      id: user.id,
      username: user.username,
      name: user.displayName,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isFollowing: user.followers.length > 0,
      isBlockedByMe: relationship.isBlockedByMe,
      hasBlockedMe: relationship.hasBlockedMe,
      canInteract: relationship.canInteract,
      ...friendRelationship,
    };
  }

  private publicUserSelect() {
    return {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      allowGroupInvite: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private normalizeLocalAvatarPath(value: string) {
    const pathname = this.avatarPathname(value);
    if (!pathname) return null;
    if (!/^\/uploads\/avatars\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(pathname)) return null;
    return pathname;
  }

  private avatarPathname(value: string) {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      if (parsed.search || parsed.hash) return null;
      return parsed.pathname;
    } catch {
      if (!value.startsWith('/uploads/avatars/')) return null;
      return value;
    }
  }
}
