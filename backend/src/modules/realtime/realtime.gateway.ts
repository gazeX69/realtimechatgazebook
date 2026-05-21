import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../safety/rate-limit.service';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private readonly pendingOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly offlineGraceMs = 3000;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async afterInit(server: Server) {
    const host = this.config.getOrThrow<string>('redis.host');
    const port = this.config.getOrThrow<number>('redis.port');
    const pubClient = new Redis({ host, port });
    const subClient = pubClient.duplicate();
    server.adapter(createAdapter(pubClient, subClient));
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token ?? this.extractBearer(client.handshake.headers.authorization);
    const connectionKey = this.connectionKey(client, token);
    if (!this.rateLimit.isAllowed('socket:connect', connectionKey, 20, 60_000)) {
      client.emit('auth.error', { reason: 'reconnect_rate_limited' });
      console.warn(`[realtime:rate-limit] reconnect flood key=${connectionKey} socket=${client.id}`);
      client.disconnect(true);
      return;
    }
    if (!token) {
      client.emit('auth.error', { reason: 'missing_token' });
      console.warn(`[realtime:auth] missing token socket=${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      client.data.user = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });
      if (client.data.user.sessionId && !(await this.isSessionActive(client.data.user.sub, client.data.user.sessionId))) {
        client.emit('auth.error', { reason: 'session_revoked' });
        console.warn(`[realtime:auth] revoked session socket=${client.id} session=${client.data.user.sessionId}`);
        client.disconnect(true);
        return;
      }
      await client.join(this.realtime.userRoom(client.data.user.sub));
      if (client.data.user.sessionId) {
        await client.join(this.realtime.sessionRoom(client.data.user.sessionId));
        this.realtime.addSessionSocket(client.data.user.sessionId, client.id);
      }
      await this.markUserOnline(client.data.user.sub, client.id);
      this.rtTrace('socket connected', { socketId: client.id, userId: client.data.user.sub, sessionId: client.data.user.sessionId });
      const presenceUserIds = await this.getPresenceSnapshotUserIds(client.data.user.sub);
      this.rtTrace('emit presence.snapshot', { socketId: client.id, userId: client.data.user.sub, count: presenceUserIds.length });
      client.emit('presence.snapshot', { userIds: presenceUserIds });
    } catch {
      client.emit('auth.error', { reason: 'invalid_token' });
      console.warn(`[realtime:auth] invalid token socket=${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user) return;
    this.rtTrace('socket disconnected', { socketId: client.id, userId: user.sub });
    if (user.sessionId) this.realtime.removeSessionSocket(user.sessionId, client.id);
    void this.markUserOffline(user.sub, client.id);
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || !body.conversationId) throw new WsException('Unauthorized');
    this.assertSocketEventAllowed(client, 'conversation.join', 30, 10_000);

    await this.conversations.assertActiveParticipant(body.conversationId, user.sub);
    await client.join(this.realtime.conversationRoom(body.conversationId));
    this.rtTrace(`join conversation:${body.conversationId}`, { socketId: client.id, userId: user.sub });
    return { event: 'conversation.joined', data: { conversationId: body.conversationId } };
  }

  @SubscribeMessage('user.typing')
  async userTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || !body.conversationId) throw new WsException('Unauthorized');
    this.assertSocketEventAllowed(client, 'user.typing', 15, 5_000);

    await this.conversations.assertActiveParticipant(body.conversationId, user.sub);
    client.to(this.realtime.conversationRoom(body.conversationId)).emit('user.typing', {
      conversationId: body.conversationId,
      user: {
        id: user.sub,
        email: user.email,
        username: user.username,
      },
    });
  }

  @SubscribeMessage('user.stopTyping')
  async userStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || !body.conversationId) throw new WsException('Unauthorized');
    this.assertSocketEventAllowed(client, 'user.stopTyping', 15, 5_000);

    await this.conversations.assertActiveParticipant(body.conversationId, user.sub);
    client.to(this.realtime.conversationRoom(body.conversationId)).emit('user.stopTyping', {
      conversationId: body.conversationId,
      user: {
        id: user.sub,
      },
    });
  }

  @SubscribeMessage('message.read')
  async messageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string; messageIds?: string[] },
  ) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || !body.conversationId) throw new WsException('Unauthorized');
    this.assertSocketEventAllowed(client, 'message.read', 30, 10_000);

    return this.conversations.markMessagesRead(body.conversationId, user.sub, body.messageIds);
  }

  private assertSocketEventAllowed(client: Socket, event: string, limit: number, windowMs: number) {
    const user = client.data.user as JwtPayload | undefined;
    const key = `${user?.sub ?? 'anonymous'}:${client.id}`;
    if (!this.rateLimit.isAllowed(`socket:${event}`, key, limit, windowMs)) {
      console.warn(`[realtime:rate-limit] event=${event} key=${key} limit=${limit}/${windowMs}ms`);
      throw new WsException('Rate limit exceeded');
    }
  }

  private connectionKey(client: Socket, token?: string | null) {
    const ip = client.handshake.address ?? 'unknown';
    if (!token) return `missing:${ip}`;
    return `${ip}:${token.slice(0, 24)}`;
  }

  private async markUserOnline(userId: string, socketId: string) {
    const hadPendingOffline = this.clearPendingOffline(userId);
    this.realtime.addUserSocket(userId, socketId);

    const clusterSocketCount = await this.getClusterUserSocketCount(userId);
    if (clusterSocketCount === 1 && !hadPendingOffline) {
      await this.emitPresenceToConversationPeers(userId, 'user.online');
    }
  }

  private async markUserOffline(userId: string, socketId: string) {
    const count = this.realtime.removeUserSocket(userId, socketId);
    if (count > 0 || this.pendingOfflineTimers.has(userId)) return;

    const timer = setTimeout(() => {
      void this.finalizeUserOffline(userId);
    }, this.offlineGraceMs);
    this.pendingOfflineTimers.set(userId, timer);
  }

  private async finalizeUserOffline(userId: string) {
    this.pendingOfflineTimers.delete(userId);
    if (this.realtime.getUserSocketCount(userId) > 0) return;
    if ((await this.getClusterUserSocketCount(userId)) > 0) return;
    await this.emitPresenceToConversationPeers(userId, 'user.offline');
  }

  private clearPendingOffline(userId: string) {
    const timer = this.pendingOfflineTimers.get(userId);
    if (!timer) return false;

    clearTimeout(timer);
    this.pendingOfflineTimers.delete(userId);
    return true;
  }

  private async getClusterUserSocketCount(userId: string) {
    const sockets = await this.server.in(this.realtime.userRoom(userId)).fetchSockets();
    return sockets.length;
  }

  private async getPresenceSnapshotUserIds(userId: string) {
    const peerIds = await this.conversations.listPeerUserIds(userId);
    const onlinePeerIds: string[] = [];

    for (const peerId of peerIds) {
      if (this.pendingOfflineTimers.has(peerId) || (await this.getClusterUserSocketCount(peerId)) > 0) {
        onlinePeerIds.push(peerId);
      }
    }

    return onlinePeerIds;
  }

  private async emitPresenceToConversationPeers(userId: string, event: 'user.online' | 'user.offline') {
    const peerIds = await this.conversations.listPeerUserIds(userId);

    for (const peerId of peerIds) {
      this.realtime.emitToUser(peerId, event, { userId });
    }
  }

  private extractBearer(value?: string) {
    if (!value?.startsWith('Bearer ')) return null;
    return value.slice('Bearer '.length);
  }

  private async isSessionActive(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(session);
  }

  private rtTrace(message: string, details?: Record<string, unknown>) {
    console.log(`[RT-TRACE] ${message}`, { at: new Date().toISOString(), ...details });
  }
}
