import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthTokens, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }] },
    });
    if (existing) throw new BadRequestException('Email or username already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username.toLowerCase(),
        displayName: dto.displayName,
        passwordHash,
      },
      select: this.publicUserSelect(),
    });
    const tokens = await this.issueTokens(user);
    return { message: 'Registered successfully', data: { user, ...tokens } };
  }

  async login(dto: LoginDto) {
    const userWithPassword = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });
    if (!userWithPassword) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, userWithPassword.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userWithPassword.id },
      select: this.publicUserSelect(),
    });
    const tokens = await this.issueTokens(user);
    return { message: 'Logged in successfully', data: { user, ...tokens } };
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const records = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    const matched = await this.findMatchingRefreshToken(records, dto.refreshToken);
    if (!matched) throw new UnauthorizedException('Invalid refresh token');

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: matched.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: this.publicUserSelect(),
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const tokens = await this.issueTokens(user);
    return { message: 'Token refreshed successfully', data: tokens };
  }

  async listSessions(userId: string, dto: RefreshTokenDto) {
    const records = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, tokenHash: true, createdAt: true, updatedAt: true, expiresAt: true },
    });
    const current = await this.findMatchingRefreshToken(records, dto.refreshToken);

    return {
      message: 'Sessions loaded',
      data: records.map((record) => ({
        id: record.id,
        current: record.id === current?.id,
        createdAt: record.createdAt,
        lastActiveAt: record.updatedAt,
        expiresAt: record.expiresAt,
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new BadRequestException('Session not found');
    void this.realtime.disconnectSession(sessionId);
    return { message: 'Session revoked', data: { sessionId } };
  }

  async revokeOtherSessions(userId: string, dto: RefreshTokenDto) {
    const records = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, tokenHash: true },
    });
    const current = await this.findMatchingRefreshToken(records, dto.refreshToken);
    if (!current) throw new UnauthorizedException('Invalid refresh token');

    const revokedSessionIds = records.filter((record) => record.id !== current.id).map((record) => record.id);
    if (revokedSessionIds.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: revokedSessionIds }, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revokedSessionIds.forEach((sessionId) => void this.realtime.disconnectSession(sessionId));
    }

    return { message: 'Other sessions revoked', data: { revokedSessionIds } };
  }

  async logout(userId: string, dto: RefreshTokenDto) {
    const records = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    const matched = await this.findMatchingRefreshToken(records, dto.refreshToken);
    if (matched) {
      await this.prisma.refreshToken.update({
        where: { id: matched.id },
        data: { revokedAt: new Date() },
      });
      void this.realtime.disconnectSession(matched.id);
    }
    return { message: 'Logged out successfully', data: null };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('New password must be different');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });
    return { message: 'Password changed successfully', data: null };
  }

  private async issueTokens(user: { id: string; email: string; username: string }): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const payload: JwtPayload = { sub: user.id, email: user.email, username: user.username, sessionId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.jwtDuration('jwt.accessExpiresIn'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.jwtDuration('jwt.refreshExpiresIn'),
    });

    await this.prisma.refreshToken.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 12),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async findMatchingRefreshToken(records: { id: string; tokenHash: string }[], token: string) {
    for (const record of records) {
      if (await bcrypt.compare(token, record.tokenHash)) return record;
    }
    return null;
  }

  private refreshTtlMs() {
    const raw = this.config.getOrThrow<string>('jwt.refreshExpiresIn');
    const match = raw.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    return value * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] ?? 86400000);
  }

  private jwtDuration(key: string) {
    return this.config.getOrThrow<string>(key) as never;
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
}
