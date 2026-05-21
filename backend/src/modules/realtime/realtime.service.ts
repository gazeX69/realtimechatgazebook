import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server?: Server;
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly sessionSockets = new Map<string, Set<string>>();

  setServer(server: Server) {
    this.server = server;
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    this.server?.to(this.conversationRoom(conversationId)).emit(event, payload);
  }

  emitGlobal(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.logEmit(event, userId);
    this.server?.to(this.userRoom(userId)).emit(event, payload);
  }

  removeUserFromConversation(userId: string, conversationId: string) {
    this.server?.in(this.userRoom(userId)).socketsLeave(this.conversationRoom(conversationId));
  }

  async disconnectSession(sessionId: string) {
    const socketIds = Array.from(this.sessionSockets.get(sessionId) ?? []);
    socketIds.forEach((socketId) => {
      const socket = this.server?.sockets.sockets.get(socketId);
      socket?.emit('auth.error', { reason: 'session_revoked' });
      setTimeout(() => socket?.disconnect(true), 100);
    });
    setTimeout(() => this.server?.in(this.sessionRoom(sessionId)).disconnectSockets(true), 500);
  }

  addUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
    return sockets.size;
  }

  removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return 0;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      return 0;
    }
    return sockets.size;
  }

  addSessionSocket(sessionId: string, socketId: string) {
    const sockets = this.sessionSockets.get(sessionId) ?? new Set<string>();
    sockets.add(socketId);
    this.sessionSockets.set(sessionId, sockets);
  }

  removeSessionSocket(sessionId: string, socketId: string) {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this.sessionSockets.delete(sessionId);
  }

  isUserOnline(userId: string) {
    return this.getUserSocketCount(userId) > 0;
  }

  getUserSocketCount(userId: string) {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  getOnlineUserIds() {
    return Array.from(this.userSockets.keys());
  }

  conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }

  sessionRoom(sessionId: string) {
    return `session:${sessionId}`;
  }

  private logEmit(event: string, userId: string) {
    if (process.env.NODE_ENV === 'production') return;
    console.log(`[realtime] emit ${event} -> ${this.userRoom(userId)} sockets=${this.getUserSocketCount(userId)}`);
  }
}
