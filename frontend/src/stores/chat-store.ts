import { create } from "zustand";
import { apiClient, apiData, apiEnvelope } from "../lib/api-client";
import { User } from "./auth-store";

export type MessageStatus = "sending" | "sent" | "read" | "error";

export type MediaAsset = {
  id: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  thumbnailStatus?: string | null;
  createdAt?: string;
  publicUrl?: string | null;
};

export type MessageAttachment = {
  id: string;
  orderIndex: number;
  mediaAsset: MediaAsset;
};

export type Conversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  name?: string | null;
  ownerId?: string | null;
  participants: { id: string; userId: string; user: User }[];
  messages: Message[];
  lastMessage?: Message | null;
  unreadCount: number;
  isBlockedByMe?: boolean;
  hasBlockedMe?: boolean;
  canInteract?: boolean;
  isFriend?: boolean;
  canChat?: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: Pick<User, "id" | "username" | "displayName" | "avatarUrl">;
  reads?: { userId: string; readAt: string }[];
  attachments?: MessageAttachment[];
  clientMessageId?: string;
  metadata?: {
    storyReply?: {
      storyId: string;
      storyOwnerId: string;
      mediaAssetId: string;
      caption?: string | null;
    };
  } | null;
};

type ChatState = {
  users: User[];
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  isLoadingConversations: boolean;
  conversationsError: string | null;
  loadingMessagesByConversation: Record<string, boolean>;
  messageLoadErrorByConversation: Record<string, string | null>;
  messageCursorByConversation: Record<string, string | null>;
  messageHasMoreByConversation: Record<string, boolean>;
  loadingOlderByConversation: Record<string, boolean>;
  messageStatus: Record<string, MessageStatus>;
  onlineUserIds: string[];
  typingUsersByConversation: Record<string, Record<string, string>>;
  activeConversationId: string | null;
  loadUsers: () => Promise<void>;
  loadConversations: () => Promise<void>;
  openDirectConversation: (participantId: string) => Promise<Conversation>;
  createGroupConversation: (
    name: string,
    memberIds: string[],
  ) => Promise<Conversation>;
  addGroupMember: (conversationId: string, userId: string) => Promise<void>;
  removeGroupMember: (conversationId: string, userId: string) => Promise<void>;
  transferGroupOwner: (conversationId: string, userId: string) => Promise<void>;
  leaveGroup: (conversationId: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  sendMessage: (
    conversationId: string,
    body: string,
    sender: Pick<User, "id" | "username" | "displayName" | "avatarUrl">,
    attachments?: MediaAsset[],
    options?: { storyReference?: { storyId: string } },
  ) => Promise<void>;
  handleIncomingMessage: (message: Message) => void;
  applyIncomingMessageNotification: (payload: {
    conversationId: string;
    message: Pick<
      Message,
      "id" | "body" | "createdAt" | "attachments" | "metadata"
    >;
    sender: Message["sender"];
  }) => void;
  setMessageStatus: (messageIds: string[], status: MessageStatus) => void;
  setMessagesRead: (
    conversationId: string,
    readerId: string,
    messageIds: string[],
  ) => void;
  setOnlineUsers: (userIds: string[]) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setUserTyping: (
    conversationId: string,
    userId: string,
    label: string,
  ) => void;
  clearUserTyping: (conversationId: string, userId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  applyUserIdentity: (
    user: Pick<User, "id" | "username" | "displayName" | "avatarUrl">,
  ) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  users: [],
  conversations: [],
  messagesByConversation: {},
  isLoadingConversations: false,
  conversationsError: null,
  loadingMessagesByConversation: {},
  messageLoadErrorByConversation: {},
  messageCursorByConversation: {},
  messageHasMoreByConversation: {},
  loadingOlderByConversation: {},
  messageStatus: {},
  onlineUserIds: [],
  typingUsersByConversation: {},
  activeConversationId: null,
  loadUsers: async () => {
    const users = await apiData<User[]>(apiClient.get("/users"));
    set({ users });
  },
  loadConversations: async () => {
    rtTrace("loadConversations:start");
    set({ isLoadingConversations: true, conversationsError: null });
    try {
      const conversations = await apiData<Conversation[]>(
        apiClient.get("/conversations"),
      );
      set((state) => {
        const mergedConversations = mergeConversationSnapshots(
          state.conversations,
          conversations,
          state.activeConversationId,
        );
        return {
          conversations: mergedConversations,
          messageStatus: recalculateMessageStatuses(
            state.messageStatus,
            state.messagesByConversation,
            mergedConversations,
          ),
          isLoadingConversations: false,
          conversationsError: null,
        };
      });
      rtTrace("loadConversations:end", { count: conversations.length });
    } catch (error) {
      set({
        isLoadingConversations: false,
        conversationsError: "Failed to load conversations.",
      });
      rtTrace("loadConversations:error", {
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  },
  openDirectConversation: async (participantId) => {
    const conversation = await apiData<Conversation>(
      apiClient.post("/conversations/direct", { participantId }),
    );
    await get().loadConversations();
    return conversation;
  },
  createGroupConversation: async (name, memberIds) => {
    const conversation = await apiData<Conversation>(
      apiClient.post("/conversations/group", { name, memberIds }),
    );
    await get().loadConversations();
    return conversation;
  },
  addGroupMember: async (conversationId, userId) => {
    await apiData<Conversation>(
      apiClient.post(`/conversations/group/${conversationId}/members`, {
        userId,
      }),
    );
    await get().loadConversations();
  },
  removeGroupMember: async (conversationId, userId) => {
    await apiClient.delete(
      `/conversations/group/${conversationId}/members/${userId}`,
    );
    await get().loadConversations();
  },
  transferGroupOwner: async (conversationId, userId) => {
    await apiData<Conversation>(
      apiClient.post(`/conversations/group/${conversationId}/owner`, {
        userId,
      }),
    );
    await get().loadConversations();
  },
  leaveGroup: async (conversationId) => {
    await apiClient.post(`/conversations/group/${conversationId}/leave`);
    set((state) => {
      const { [conversationId]: _messages, ...messagesByConversation } =
        state.messagesByConversation;
      return {
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        ),
        messagesByConversation,
        activeConversationId:
          state.activeConversationId === conversationId
            ? null
            : state.activeConversationId,
      };
    });
    await get().loadConversations();
  },
  loadMessages: async (conversationId) => {
    rtTrace(`loadMessages:start conversation:${conversationId}`);
    set((state) => ({
      loadingMessagesByConversation: {
        ...state.loadingMessagesByConversation,
        [conversationId]: true,
      },
      messageLoadErrorByConversation: {
        ...state.messageLoadErrorByConversation,
        [conversationId]: null,
      },
    }));
    try {
      const response = await apiEnvelope<Message[]>(
        apiClient.get(`/conversations/${conversationId}/messages`),
      );
      set((state) => ({
        ...ingestMessages(state, conversationId, response.data),
        loadingMessagesByConversation: {
          ...state.loadingMessagesByConversation,
          [conversationId]: false,
        },
        messageLoadErrorByConversation: {
          ...state.messageLoadErrorByConversation,
          [conversationId]: null,
        },
        messageCursorByConversation: {
          ...state.messageCursorByConversation,
          [conversationId]:
            typeof response.meta?.nextCursor === "string"
              ? response.meta.nextCursor
              : null,
        },
        messageHasMoreByConversation: {
          ...state.messageHasMoreByConversation,
          [conversationId]: Boolean(response.meta?.hasNextPage),
        },
      }));
      rtTrace(`loadMessages:end conversation:${conversationId}`, {
        count: response.data.length,
      });
    } catch (error) {
      set((state) => ({
        loadingMessagesByConversation: {
          ...state.loadingMessagesByConversation,
          [conversationId]: false,
        },
        messageLoadErrorByConversation: {
          ...state.messageLoadErrorByConversation,
          [conversationId]: "Failed to load messages.",
        },
      }));
      rtTrace(`loadMessages:error conversation:${conversationId}`, {
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  },
  loadOlderMessages: async (conversationId) => {
    const state = get();
    const cursor = state.messageCursorByConversation[conversationId];
    if (
      !cursor ||
      !state.messageHasMoreByConversation[conversationId] ||
      state.loadingOlderByConversation[conversationId]
    )
      return;

    set((current) => ({
      loadingOlderByConversation: {
        ...current.loadingOlderByConversation,
        [conversationId]: true,
      },
    }));
    try {
      const response = await apiEnvelope<Message[]>(
        apiClient.get(`/conversations/${conversationId}/messages`, {
          params: { cursor },
        }),
      );
      set((current) => {
        return {
          ...ingestMessages(current, conversationId, response.data),
          messageCursorByConversation: {
            ...current.messageCursorByConversation,
            [conversationId]:
              typeof response.meta?.nextCursor === "string"
                ? response.meta.nextCursor
                : null,
          },
          messageHasMoreByConversation: {
            ...current.messageHasMoreByConversation,
            [conversationId]: Boolean(response.meta?.hasNextPage),
          },
        };
      });
    } finally {
      set((current) => ({
        loadingOlderByConversation: {
          ...current.loadingOlderByConversation,
          [conversationId]: false,
        },
      }));
    }
  },
  markConversationRead: async (conversationId) => {
    rtTrace(`markConversationRead:start conversation:${conversationId}`);
    const readReceipt = await apiData<{
      conversationId: string;
      readerId: string;
      messageIds: string[];
      readCount: number;
    }>(apiClient.post(`/conversations/${conversationId}/read-all`));
    get().setMessagesRead(
      readReceipt.conversationId,
      readReceipt.readerId,
      readReceipt.messageIds,
    );
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    }));
    rtTrace(`markConversationRead:end conversation:${conversationId}`, {
      readCount: readReceipt.readCount,
    });
  },
  sendMessage: async (
    conversationId,
    body,
    sender,
    attachments = [],
    options,
  ) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: tempId,
      clientMessageId: tempId,
      conversationId,
      senderId: sender.id,
      body,
      createdAt: new Date().toISOString(),
      sender,
      metadata: options?.storyReference
        ? {
            storyReply: {
              storyId: options.storyReference.storyId,
              storyOwnerId: "",
              mediaAssetId: "",
            },
          }
        : undefined,
      attachments: attachments.map((mediaAsset, orderIndex) => ({
        id: `temp-attachment-${mediaAsset.id}`,
        orderIndex,
        mediaAsset: toPrivateChatMediaAsset(mediaAsset),
      })),
    };

    get().handleIncomingMessage(optimisticMessage);
    get().setMessageStatus([tempId], "sending");

    try {
      const payload: {
        body?: string;
        attachmentIds: string[];
        clientMessageId: string;
        storyReference?: { storyId: string };
      } = {
        attachmentIds: attachments.map((attachment) => attachment.id),
        clientMessageId: tempId,
      };
      if (body) payload.body = body;
      if (options?.storyReference)
        payload.storyReference = options.storyReference;
      const message = await apiData<Message>(
        apiClient.post(`/conversations/${conversationId}/messages`, payload),
      );
      get().handleIncomingMessage(message);
    } catch (error) {
      set((state) => removeMessage(state, conversationId, tempId));
      throw error;
    }
  },
  handleIncomingMessage: (message) => {
    set((state) => {
      return ingestMessages(state, message.conversationId, [message]);
    });
  },
  applyIncomingMessageNotification: (payload) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === payload.conversationId
          ? applyConversationNotification(
              conversation,
              payload,
              state.activeConversationId,
              state.messagesByConversation[payload.conversationId] ?? [],
            )
          : conversation,
      ),
    }));
  },
  setMessageStatus: (messageIds, status) => {
    set((state) => ({
      messageStatus: messageIds.reduce(
        (nextStatus, messageId) => ({
          ...nextStatus,
          [messageId]: resolveMessageStatus(nextStatus[messageId], status),
        }),
        state.messageStatus,
      ),
    }));
  },
  setMessagesRead: (conversationId, readerId, messageIds) => {
    set((state) =>
      applyReadReceipt(state, conversationId, readerId, messageIds),
    );
  },
  setOnlineUsers: (userIds) => {
    set({ onlineUserIds: Array.from(new Set(userIds)) });
  },
  setUserOnline: (userId) => {
    set((state) => {
      if (state.onlineUserIds.includes(userId)) return state;
      return { onlineUserIds: [...state.onlineUserIds, userId] };
    });
  },
  setUserOffline: (userId) => {
    set((state) => ({
      onlineUserIds: state.onlineUserIds.filter((id) => id !== userId),
    }));
  },
  setUserTyping: (conversationId, userId, label) => {
    set((state) => ({
      typingUsersByConversation: {
        ...state.typingUsersByConversation,
        [conversationId]: {
          ...(state.typingUsersByConversation[conversationId] ?? {}),
          [userId]: label,
        },
      },
    }));
  },
  clearUserTyping: (conversationId, userId) => {
    set((state) => {
      const conversationTyping =
        state.typingUsersByConversation[conversationId];
      if (!conversationTyping?.[userId]) return state;

      const { [userId]: _, ...remainingTyping } = conversationTyping;
      return {
        typingUsersByConversation: {
          ...state.typingUsersByConversation,
          [conversationId]: remainingTyping,
        },
      };
    });
  },
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
  },
  applyUserIdentity: (user) => {
    set((state) => ({
      users: state.users.map((item) =>
        item.id === user.id ? { ...item, ...user } : item,
      ),
      conversations: state.conversations.map((conversation) =>
        patchConversationUser(conversation, user),
      ),
      messagesByConversation: Object.fromEntries(
        Object.entries(state.messagesByConversation).map(
          ([conversationId, messages]) => [
            conversationId,
            messages.map((message) => patchMessageSender(message, user)),
          ],
        ),
      ),
    }));
  },
}));

const messageStatusRank: Record<MessageStatus, number> = {
  error: -1,
  sending: 0,
  sent: 1,
  read: 2,
};

function highestMessageStatus(
  current: MessageStatus | undefined,
  next: MessageStatus,
) {
  if (!current) return next;
  return messageStatusRank[next] >= messageStatusRank[current] ? next : current;
}

function resolveMessageStatus(
  current: MessageStatus | undefined,
  next: MessageStatus,
) {
  if (next === "error") return "error";
  return highestMessageStatus(current, next);
}

function toPrivateChatMediaAsset(mediaAsset: MediaAsset): MediaAsset {
  return { ...mediaAsset, publicUrl: null };
}

function applyConversationNotification(
  conversation: Conversation,
  payload: {
    conversationId: string;
    message: Pick<
      Message,
      "id" | "body" | "createdAt" | "attachments" | "metadata"
    >;
    sender: Message["sender"];
  },
  activeConversationId: string | null,
  loadedMessages: Message[],
) {
  const message = {
    id: payload.message.id,
    conversationId: payload.conversationId,
    senderId: payload.sender.id,
    body: payload.message.body,
    metadata: payload.message.metadata,
    createdAt: payload.message.createdAt,
    sender: payload.sender,
    attachments: payload.message.attachments,
  };
  const alreadyCurrent =
    conversation.lastMessage?.id === payload.message.id ||
    conversation.messages.some((item) => item.id === payload.message.id) ||
    loadedMessages.some((item) => item.id === payload.message.id);

  return {
    ...conversation,
    unreadCount:
      activeConversationId === payload.conversationId || alreadyCurrent
        ? conversation.unreadCount
        : conversation.unreadCount + 1,
    lastMessage: pickLatestMessage(conversation.lastMessage, message),
  };
}

function patchConversationUser(
  conversation: Conversation,
  user: Pick<User, "id" | "username" | "displayName" | "avatarUrl">,
): Conversation {
  return {
    ...conversation,
    participants: conversation.participants.map((participant) =>
      participant.user.id === user.id
        ? { ...participant, user: { ...participant.user, ...user } }
        : participant,
    ),
    messages: conversation.messages.map((message) =>
      patchMessageSender(message, user),
    ),
    lastMessage: conversation.lastMessage
      ? patchMessageSender(conversation.lastMessage, user)
      : conversation.lastMessage,
  };
}

function patchMessageSender(
  message: Message,
  user: Pick<User, "id" | "username" | "displayName" | "avatarUrl">,
): Message {
  if (message.sender.id !== user.id) return message;
  return { ...message, sender: { ...message.sender, ...user } };
}

function mergeConversationSnapshots(
  currentConversations: Conversation[],
  incomingConversations: Conversation[],
  activeConversationId: string | null,
) {
  const currentById = new Map(
    currentConversations.map((conversation) => [conversation.id, conversation]),
  );

  return incomingConversations.map((incoming) => {
    const current = currentById.get(incoming.id);
    if (!current) return incoming;

    const currentLastMessage =
      current.lastMessage ?? current.messages[0] ?? null;
    const incomingLastMessage =
      incoming.lastMessage ?? incoming.messages[0] ?? null;
    const latestLastMessage = pickLatestMessage(
      currentLastMessage,
      incomingLastMessage,
    );
    const snapshotIsOlder =
      Boolean(currentLastMessage) &&
      (!incomingLastMessage ||
        new Date(incomingLastMessage.createdAt).getTime() <
          new Date(currentLastMessage.createdAt).getTime());

    return {
      ...incoming,
      messages: mergeConversationMessages(current.messages, incoming.messages),
      lastMessage: latestLastMessage,
      unreadCount:
        activeConversationId === incoming.id
          ? 0
          : snapshotIsOlder
            ? current.unreadCount
            : incoming.unreadCount,
    };
  });
}

function ingestMessages(
  state: ChatState,
  conversationId: string,
  incomingMessages: Message[],
) {
  const currentMessages = state.messagesByConversation[conversationId] ?? [];
  const messages = mergeMessages(currentMessages, incomingMessages);
  const conversation = state.conversations.find(
    (item) => item.id === conversationId,
  );
  const messageStatus = { ...state.messageStatus };

  incomingMessages.forEach((message) => {
    const replacedMessage = currentMessages.find((item) =>
      isSameMessageLifecycle(item, message),
    );
    const previousStatus =
      messageStatus[message.id] ??
      (replacedMessage ? messageStatus[replacedMessage.id] : undefined);
    const mergedMessage =
      messages.find((item) => isSameMessageLifecycle(item, message)) ?? message;
    const nextStatus = isMessageReadByConversation(mergedMessage, conversation)
      ? highestMessageStatus(previousStatus, "read")
      : message.id.startsWith("temp-")
        ? highestMessageStatus(previousStatus, "sending")
        : highestMessageStatus(previousStatus, "sent");

    if (replacedMessage?.id && replacedMessage.id !== message.id)
      delete messageStatus[replacedMessage.id];
    messageStatus[message.id] = nextStatus;
  });

  return {
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: mergeConversationMessages(
              conversation.messages,
              incomingMessages,
            ),
            lastMessage: pickLatestMessage(
              conversation.lastMessage,
              pickLatestMessageFromMessages(incomingMessages),
            ),
          }
        : conversation,
    ),
    messagesByConversation: {
      ...state.messagesByConversation,
      [conversationId]: messages,
    },
    messageStatus,
  };
}

function applyReadReceipt(
  state: ChatState,
  conversationId: string,
  readerId: string,
  messageIds: string[],
) {
  if (messageIds.length === 0) return state;

  const messageIdSet = new Set(messageIds);
  const conversation = state.conversations.find(
    (item) => item.id === conversationId,
  );
  const patchMessage = (message: Message) => {
    if (!messageIdSet.has(message.id) || message.senderId === readerId)
      return message;
    const reads = upsertRead(message.reads ?? [], readerId);
    return { ...message, reads };
  };
  const nextMessages = (state.messagesByConversation[conversationId] ?? []).map(
    patchMessage,
  );
  const messageStatus = { ...state.messageStatus };

  nextMessages.forEach((message) => {
    if (!messageIdSet.has(message.id)) return;
    messageStatus[message.id] = isMessageReadByConversation(
      message,
      conversation,
    )
      ? highestMessageStatus(messageStatus[message.id], "read")
      : highestMessageStatus(messageStatus[message.id], "sent");
  });

  return {
    messagesByConversation: {
      ...state.messagesByConversation,
      [conversationId]: nextMessages,
    },
    conversations: state.conversations.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            messages: item.messages.map(patchMessage),
            lastMessage: item.lastMessage
              ? patchMessage(item.lastMessage)
              : item.lastMessage,
          }
        : item,
    ),
    messageStatus,
  };
}

function upsertRead(
  reads: { userId: string; readAt: string }[],
  userId: string,
) {
  if (reads.some((read) => read.userId === userId)) return reads;
  return [...reads, { userId, readAt: new Date().toISOString() }];
}

function isMessageReadByConversation(
  message: Message,
  conversation?: Conversation,
) {
  if (!conversation) return false;
  const readerIds = new Set((message.reads ?? []).map((read) => read.userId));
  const requiredReaderIds = conversation.participants
    .map((participant) => participant.userId)
    .filter((userId) => userId !== message.senderId);

  return (
    requiredReaderIds.length > 0 &&
    requiredReaderIds.every((userId) => readerIds.has(userId))
  );
}

function recalculateMessageStatuses(
  currentStatus: Record<string, MessageStatus>,
  messagesByConversation: Record<string, Message[]>,
  conversations: Conversation[],
) {
  const conversationsById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const nextStatus = { ...currentStatus };

  Object.entries(messagesByConversation).forEach(
    ([conversationId, messages]) => {
      const conversation = conversationsById.get(conversationId);
      messages.forEach((message) => {
        if (message.id.startsWith("temp-")) return;
        nextStatus[message.id] = isMessageReadByConversation(
          message,
          conversation,
        )
          ? highestMessageStatus(nextStatus[message.id], "read")
          : highestMessageStatus(nextStatus[message.id], "sent");
      });
    },
  );

  return nextStatus;
}

function isSameMessageLifecycle(left: Message, right: Message) {
  if (left.id === right.id) return true;
  if (left.clientMessageId && left.clientMessageId === right.clientMessageId)
    return true;
  if (left.id.startsWith("temp-") && left.id === right.clientMessageId)
    return true;
  if (right.id.startsWith("temp-") && right.id === left.clientMessageId)
    return true;
  return false;
}

function mergeMessages(...messageGroups: Message[][]) {
  const merged: Message[] = [];
  messageGroups.flat().forEach((message) => {
    const existingIndex = merged.findIndex((item) =>
      isSameMessageLifecycle(item, message),
    );
    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      merged[existingIndex] =
        existing.id.startsWith("temp-") && !message.id.startsWith("temp-")
          ? message
          : existing;
      return;
    }
    merged.push(message);
  });

  return merged.sort((a, b) => {
    const createdAtDelta =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdAtDelta !== 0) return createdAtDelta;
    return a.id.localeCompare(b.id);
  });
}

function removeMessage(
  state: ChatState,
  conversationId: string,
  messageId: string,
) {
  const messages = (state.messagesByConversation[conversationId] ?? []).filter(
    (message) => message.id !== messageId,
  );
  const { [messageId]: _removedStatus, ...messageStatus } = state.messageStatus;

  return {
    messagesByConversation: {
      ...state.messagesByConversation,
      [conversationId]: messages,
    },
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: conversation.messages.filter(
              (message) => message.id !== messageId,
            ),
            lastMessage:
              conversation.lastMessage?.id === messageId
                ? pickLatestMessageFromMessages(messages)
                : conversation.lastMessage,
          }
        : conversation,
    ),
    messageStatus,
  };
}

function mergeConversationMessages(
  messages: Message[],
  incomingMessages: Message[],
) {
  return mergeMessages(messages, incomingMessages).reverse();
}

function pickLatestMessage(
  current: Message | null | undefined,
  next: Message | null | undefined,
) {
  if (!next) return current ?? null;
  if (!current) return next;
  const createdAtDelta =
    new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime();
  if (createdAtDelta !== 0) return createdAtDelta > 0 ? next : current;
  return next.id.localeCompare(current.id) >= 0 ? next : current;
}

function pickLatestMessageFromMessages(messages: Message[]) {
  return mergeMessages(messages).at(-1) ?? null;
}

function rtTrace(message: string, details?: Record<string, unknown>) {
  console.info(`[RT-TRACE] ${message}`, {
    at: new Date().toISOString(),
    ...details,
  });
}
