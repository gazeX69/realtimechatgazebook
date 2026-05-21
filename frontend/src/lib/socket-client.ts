import { io, Socket } from 'socket.io-client';
import { notifyAuthExpired, refreshAccessTokenOnce } from './api-client';
import { authStorage } from './auth-storage';

let socket: Socket | null = null;
const joinedConversationIds = new Set<string>();
let presenceListenersRegistered = false;
let socketAuthRecoveryInProgress = false;
let reconnectCount = 0;
let authFailureCount = 0;
const WS_URL = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';
export type SocketConnectionState = 'connected' | 'reconnecting' | 'disconnected';
let socketConnectionState: SocketConnectionState = 'disconnected';
const socketConnectionListeners = new Set<(state: SocketConnectionState) => void>();

function rtTrace(message: string, details?: Record<string, unknown>) {
  console.info(`[RT-TRACE] ${message}`, { at: new Date().toISOString(), ...details });
}

function setSocketConnectionState(state: SocketConnectionState) {
  if (socketConnectionState === state) return;
  socketConnectionState = state;
  socketConnectionListeners.forEach((listener) => listener(state));
}

export function getSocketConnectionState() {
  return socketConnectionState;
}

export function subscribeSocketConnectionState(listener: (state: SocketConnectionState) => void) {
  socketConnectionListeners.add(listener);
  listener(socketConnectionState);
  return () => {
    socketConnectionListeners.delete(listener);
  };
}

export function getSocket() {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      auth: { token: authStorage.getAccessToken() },
      withCredentials: true,
      extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
    });
    socket.on('connect', () => {
      reconnectCount += 1;
      authFailureCount = 0;
      setSocketConnectionState('connected');
      rtTrace('connect', { count: reconnectCount, rooms: joinedConversationIds.size, socketId: socket?.id });
      console.info(`[socket] connected count=${reconnectCount} rooms=${joinedConversationIds.size}`);
      joinedConversationIds.forEach((conversationId) => {
        rtTrace(`conversation.join emit conversation:${conversationId}`, { socketId: socket?.id });
        socket?.emit('conversation.join', { conversationId });
      });
    });
    socket.on('disconnect', (reason) => {
      setSocketConnectionState(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
      rtTrace('disconnect', { reason, socketId: socket?.id });
      console.info(`[socket] disconnected reason=${reason}`);
    });
    socket.on('connect_error', (error) => {
      setSocketConnectionState('reconnecting');
      rtTrace('connect_error', { message: error.message });
      void handleSocketAuthFailure(`connect_error:${error.message}`);
    });
    socket.on('auth.error', (payload: { reason?: string }) => {
      rtTrace('auth.error', { reason: payload.reason });
      void handleSocketAuthFailure(payload.reason ?? 'auth_error');
    });
    socket.on('conversation.joined', (payload: { conversationId?: string }) => {
      rtTrace(`conversation.joined receive conversation:${payload.conversationId ?? 'unknown'}`, { socketId: socket?.id });
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      rtTrace('reconnect_attempt', { attempt });
    });
    socket.io.on('reconnect', (attempt) => {
      rtTrace('reconnect', { attempt, socketId: socket?.id });
    });
  }
  socket.auth = { token: authStorage.getAccessToken() };
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  joinedConversationIds.clear();
  presenceListenersRegistered = false;
  socketAuthRecoveryInProgress = false;
  authFailureCount = 0;
  setSocketConnectionState('disconnected');
}

async function handleSocketAuthFailure(reason: string) {
  authFailureCount += 1;
  console.warn(`[socket] auth failure #${authFailureCount}: ${reason}`);
  if (socketAuthRecoveryInProgress) {
    console.info('[socket] auth recovery already in progress');
    return;
  }
  if (!socket || authFailureCount > 2) {
    notifyAuthExpired('socket_auth_failed');
    disconnectSocket();
    return;
  }

  socketAuthRecoveryInProgress = true;
  setSocketConnectionState('reconnecting');
  socket.disconnect();
  try {
    const token = await refreshAccessTokenOnce();
    if (!token) {
      notifyAuthExpired('socket_refresh_failed');
      disconnectSocket();
      return;
    }

    console.info('[socket] retrying connect after token refresh');
    socket.auth = { token };
    socket.connect();
  } finally {
    socketAuthRecoveryInProgress = false;
  }
}

export function joinConversationRoom(conversationId: string) {
  if (!authStorage.getAccessToken() && !authStorage.getRefreshToken()) {
    notifyAuthExpired('socket_missing_token');
    return getSocket();
  }
  const activeSocket = getSocket();
  activeSocket.connect();

  if (joinedConversationIds.has(conversationId)) return activeSocket;
  joinedConversationIds.add(conversationId);
  if (activeSocket.connected) {
    rtTrace(`conversation.join emit conversation:${conversationId}`, { socketId: activeSocket.id });
    activeSocket.emit('conversation.join', { conversationId });
  }

  return activeSocket;
}

export function emitTyping(conversationId: string) {
  const activeSocket = getSocket();
  if (!activeSocket.connected) return;
  activeSocket.emit('user.typing', { conversationId });
}

export function emitStopTyping(conversationId: string) {
  const activeSocket = getSocket();
  if (!activeSocket.connected) return;
  activeSocket.emit('user.stopTyping', { conversationId });
}

export function registerPresenceListeners(handlers: {
  onSnapshot: (userIds: string[]) => void;
  onOnline: (userId: string) => void;
  onOffline: (userId: string) => void;
}) {
  const activeSocket = getSocket();
  if (presenceListenersRegistered) return;

  activeSocket.on('presence.snapshot', (payload: { userIds?: string[] }) => {
    rtTrace('presence.snapshot', { count: payload.userIds?.length ?? 0 });
    handlers.onSnapshot(payload.userIds ?? []);
  });
  activeSocket.on('user.online', (payload: { userId?: string }) => {
    if (payload.userId) handlers.onOnline(payload.userId);
  });
  activeSocket.on('user.offline', (payload: { userId?: string }) => {
    if (payload.userId) handlers.onOffline(payload.userId);
  });
  presenceListenersRegistered = true;
}
