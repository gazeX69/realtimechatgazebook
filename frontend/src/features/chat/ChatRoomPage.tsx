import { Paperclip, Send } from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { AttachmentRenderer } from "../../components/media/AttachmentRenderer";
import {
  MediaDraftPreview,
  MediaDraftPreviewItem,
} from "../../components/media/MediaDraftPreview";
import { SocialText } from "../../components/social/SocialText";
import { resolveUserIdentity } from "../../lib/identity-resolver";
import { apiClient, apiData } from "../../lib/api-client";
import {
  emitStopTyping,
  emitTyping,
  getSocketConnectionState,
  joinConversationRoom,
  subscribeSocketConnectionState,
  SocketConnectionState,
} from "../../lib/socket-client";
import { useAuthStore } from "../../stores/auth-store";
import {
  MediaAsset,
  Message,
  MessageStatus,
  useChatStore,
} from "../../stores/chat-store";
import { useFeedStore } from "../../stores/feed-store";
import { useFriendStore } from "../../stores/friend-store";

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TYPING_USERS: Record<string, string> = {};
const EMPTY_MESSAGE_STATUS: Record<string, MessageStatus> = {};
const MAX_ATTACHMENTS = 4;

type UploadDraft = MediaDraftPreviewItem & {
  file: File;
};

export function ChatRoomPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const conversations = useChatStore((state) => state.conversations);
  const friends = useFriendStore((state) => state.friends);
  const onlineUserIds = useChatStore((state) => state.onlineUserIds);
  const typingUsers = useChatStore((state) =>
    conversationId
      ? (state.typingUsersByConversation[conversationId] ?? EMPTY_TYPING_USERS)
      : EMPTY_TYPING_USERS,
  );
  const messages = useChatStore((state) =>
    conversationId
      ? (state.messagesByConversation[conversationId] ?? EMPTY_MESSAGES)
      : EMPTY_MESSAGES,
  );
  const messageStatus = useChatStore(
    (state) => state.messageStatus ?? EMPTY_MESSAGE_STATUS,
  );
  const isLoadingMessages = useChatStore((state) =>
    conversationId
      ? Boolean(state.loadingMessagesByConversation[conversationId])
      : false,
  );
  const messageLoadError = useChatStore((state) =>
    conversationId
      ? state.messageLoadErrorByConversation[conversationId]
      : null,
  );
  const loadingOlder = useChatStore((state) =>
    conversationId
      ? Boolean(state.loadingOlderByConversation[conversationId])
      : false,
  );
  const hasOlderMessages = useChatStore((state) =>
    conversationId
      ? Boolean(state.messageHasMoreByConversation[conversationId])
      : false,
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextAutoScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const typingEmitThrottleRef = useRef<number | null>(null);
  const stopTypingTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const typingClearTimersRef = useRef<Record<string, number>>({});
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const pendingReadMessageIdsRef = useRef<Set<string>>(new Set());
  const readRetryTimerRef = useRef<number | null>(null);
  const uploadDraftsRef = useRef<UploadDraft[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentUploadError, setAttachmentUploadError] = useState<
    string | null
  >(null);
  const [selectedAttachments, setSelectedAttachments] = useState<MediaAsset[]>(
    [],
  );
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [groupActionStatus, setGroupActionStatus] = useState<string | null>(
    null,
  );
  const [roomAccessError, setRoomAccessError] = useState<string | null>(null);
  const [pendingRemoveUserId, setPendingRemoveUserId] = useState<string | null>(
    null,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [ownerTransferTargetId, setOwnerTransferTargetId] = useState("");
  const [socketState, setSocketState] = useState<SocketConnectionState>(() =>
    getSocketConnectionState(),
  );
  const [isBrowserOffline, setIsBrowserOffline] = useState(
    () => !navigator.onLine,
  );
  const [readRetryNonce, setReadRetryNonce] = useState(0);

  const currentConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  );
  const otherUser = currentConversation?.participants.find(
    (participant) => participant.user.id !== currentUser?.id,
  )?.user;
  const otherIdentity = resolveUserIdentity(otherUser);
  const conversationTitle =
    currentConversation?.type === "GROUP"
      ? (currentConversation.name ?? "Group chat")
      : otherUser
        ? otherIdentity.displayName
        : "Chat Room";
  const groupParticipants =
    currentConversation?.type === "GROUP"
      ? currentConversation.participants
      : [];
  const groupParticipantIds = useMemo(
    () => new Set(groupParticipants.map((participant) => participant.userId)),
    [groupParticipants],
  );
  const availableGroupMembers = useMemo(
    () =>
      friends
        .filter(
          (friend) =>
            friend.canChat &&
            friend.id !== currentUser?.id &&
            !groupParticipantIds.has(friend.id),
        )
        .sort((left, right) => left.username.localeCompare(right.username)),
    [currentUser?.id, friends, groupParticipantIds],
  );
  const interactionRestricted = currentConversation?.canInteract === false;
  const notFriend = currentConversation?.isFriend === false;
  const isGroupOwner =
    currentConversation?.type === "GROUP" &&
    currentConversation.ownerId === currentUser?.id;
  const ownerTransferCandidates = useMemo(
    () =>
      groupParticipants
        .filter((participant) => participant.userId !== currentUser?.id)
        .sort((left, right) =>
          left.user.username.localeCompare(right.user.username),
        ),
    [currentUser?.id, groupParticipants],
  );
  const isOtherUserOnline = otherUser
    ? onlineUserIds.includes(otherUser.id)
    : false;
  const typingLabels = useMemo(
    () =>
      Object.entries(typingUsers)
        .filter(([userId]) => userId !== currentUser?.id)
        .map(([, label]) => label),
    [currentUser?.id, typingUsers],
  );

  useEffect(() => {
    return subscribeSocketConnectionState(setSocketState);
  }, []);

  useEffect(() => {
    const handleOffline = () => setIsBrowserOffline(true);
    const handleOnline = () => setIsBrowserOffline(false);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    useChatStore.getState().setActiveConversation(conversationId);
    setRoomAccessError(null);
    setGroupActionStatus(null);
    void resyncActiveConversation(conversationId).catch(() => {
      setRoomAccessError("You no longer have access to this conversation.");
      void useChatStore.getState().loadConversations();
    });
    void useFriendStore.getState().fetchFriends();
    return () => useChatStore.getState().setActiveConversation(null);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const socket = joinConversationRoom(conversationId);

    const handleMessageSent = (message: Message) => {
      rtTrace(`message.sent conversation:${message.conversationId}`, {
        messageId: message.id,
        activeConversationId: conversationId,
      });
      if (message.conversationId === conversationId)
        useChatStore.getState().handleIncomingMessage(message);
    };
    const handleReconnectMessages = () => {
      rtTrace(`connect ChatRoomPage:resync conversation:${conversationId}`);
      void resyncActiveConversation(conversationId).catch(() => {
        setRoomAccessError("You no longer have access to this conversation.");
        void useChatStore.getState().loadConversations();
      });
    };
    const handleUserTyping = (payload: {
      conversationId?: string;
      user?: { id?: string; username?: string };
    }) => {
      if (
        payload.conversationId !== conversationId ||
        !payload.user?.id ||
        payload.user.id === currentUser?.id
      )
        return;

      const label = payload.user.username
        ? `@${payload.user.username}`
        : "User";
      useChatStore
        .getState()
        .setUserTyping(conversationId, payload.user.id, label);

      const existingTimer = typingClearTimersRef.current[payload.user.id];
      if (existingTimer) window.clearTimeout(existingTimer);
      typingClearTimersRef.current[payload.user.id] = window.setTimeout(() => {
        useChatStore
          .getState()
          .clearUserTyping(conversationId, payload.user!.id!);
        delete typingClearTimersRef.current[payload.user!.id!];
      }, 3000);
    };
    const handleUserStopTyping = (payload: {
      conversationId?: string;
      user?: { id?: string };
    }) => {
      if (
        payload.conversationId !== conversationId ||
        !payload.user?.id ||
        payload.user.id === currentUser?.id
      )
        return;
      const existingTimer = typingClearTimersRef.current[payload.user.id];
      if (existingTimer) window.clearTimeout(existingTimer);
      useChatStore.getState().clearUserTyping(conversationId, payload.user.id);
      delete typingClearTimersRef.current[payload.user.id];
    };

    socket.on("message.sent", handleMessageSent);
    socket.on("connect", handleReconnectMessages);
    socket.on("user.typing", handleUserTyping);
    socket.on("user.stopTyping", handleUserStopTyping);
    return () => {
      socket.off("message.sent", handleMessageSent);
      socket.off("connect", handleReconnectMessages);
      socket.off("user.typing", handleUserTyping);
      socket.off("user.stopTyping", handleUserStopTyping);
      if (typingEmitThrottleRef.current)
        window.clearTimeout(typingEmitThrottleRef.current);
      if (stopTypingTimerRef.current)
        window.clearTimeout(stopTypingTimerRef.current);
      Object.values(typingClearTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      typingClearTimersRef.current = {};
    };
  }, [conversationId, currentUser?.id]);

  useEffect(() => {
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false;
      return;
    }
    if (!isNearBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!conversationId || !currentUser?.id || roomAccessError) return;
    let cancelled = false;
    const unreadPeerMessageIds = messages
      .filter(
        (message) =>
          message.senderId !== currentUser.id &&
          !readMessageIdsRef.current.has(message.id) &&
          !pendingReadMessageIdsRef.current.has(message.id),
      )
      .map((message) => message.id);
    if (unreadPeerMessageIds.length === 0) return;

    unreadPeerMessageIds.forEach((messageId) =>
      pendingReadMessageIdsRef.current.add(messageId),
    );
    void useChatStore
      .getState()
      .markConversationRead(conversationId)
      .then(() => {
        unreadPeerMessageIds.forEach((messageId) =>
          readMessageIdsRef.current.add(messageId),
        );
      })
      .catch(() => {
        if (cancelled) return;
        if (readRetryTimerRef.current) return;
        readRetryTimerRef.current = window.setTimeout(() => {
          readRetryTimerRef.current = null;
          setReadRetryNonce((value) => value + 1);
        }, 3000);
      })
      .finally(() => {
        unreadPeerMessageIds.forEach((messageId) =>
          pendingReadMessageIdsRef.current.delete(messageId),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    currentUser?.id,
    messages.length,
    readRetryNonce,
    roomAccessError,
  ]);

  useEffect(() => {
    resizeComposer();
  }, [draftMessage]);

  useEffect(() => {
    uploadDraftsRef.current = uploadDrafts;
  }, [uploadDrafts]);

  useEffect(() => {
    return () => {
      if (readRetryTimerRef.current)
        window.clearTimeout(readRetryTimerRef.current);
      uploadDraftsRef.current.forEach((draft) => {
        if (draft.url) URL.revokeObjectURL(draft.url);
      });
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function submitMessage() {
    if (!conversationId || !currentUser) return;
    const body = draftMessage.trim();
    if (
      (!body && selectedAttachments.length === 0) ||
      isSending ||
      isUploadingAttachment ||
      uploadDrafts.length > 0 ||
      interactionRestricted ||
      roomAccessError
    )
      return;

    setIsSending(true);
    try {
      stopLocalTyping();
      setDraftMessage("");
      const attachments = selectedAttachments;
      setSelectedAttachments([]);
      await sendMessage(conversationId, body, currentUser, attachments);
      requestAnimationFrame(resizeComposer);
    } finally {
      setIsSending(false);
    }
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(
      0,
      MAX_ATTACHMENTS - selectedAttachments.length - uploadDrafts.length,
    );
    event.target.value = "";
    if (files.length === 0) return;
    const drafts = files.map((file) => ({
      id: `draft-${crypto.randomUUID()}`,
      file,
      mimeType: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
      name: file.name,
      status: "uploading" as const,
    }));
    setUploadDrafts((current) => [...current, ...drafts]);
    setIsUploadingAttachment(true);
    setAttachmentUploadError(null);
    try {
      const uploaded: MediaAsset[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        uploaded.push(
          await apiData<MediaAsset>(apiClient.post("/media/upload", form)),
        );
      }
      setSelectedAttachments((current) =>
        [...current, ...uploaded].slice(0, MAX_ATTACHMENTS),
      );
      setUploadDrafts((current) =>
        clearDrafts(
          current,
          drafts.map((draft) => draft.id),
        ),
      );
    } catch {
      setAttachmentUploadError("Attachment upload failed. Try again.");
      setUploadDrafts((current) =>
        current.map((draft) =>
          drafts.some((item) => item.id === draft.id)
            ? { ...draft, status: "error" }
            : draft,
        ),
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  function handleMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setDraftMessage(value);
    if (!conversationId || roomAccessError) return;
    if (!value.trim()) {
      stopLocalTyping();
      return;
    }

    if (!isTypingRef.current) {
      emitTyping(conversationId);
      isTypingRef.current = true;
    } else if (!typingEmitThrottleRef.current) {
      typingEmitThrottleRef.current = window.setTimeout(() => {
        emitTyping(conversationId);
        typingEmitThrottleRef.current = null;
      }, 1200);
    }

    if (stopTypingTimerRef.current)
      window.clearTimeout(stopTypingTimerRef.current);
    stopTypingTimerRef.current = window.setTimeout(() => {
      stopLocalTyping();
    }, 2500);
  }

  function stopLocalTyping() {
    if (stopTypingTimerRef.current) {
      window.clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
    if (typingEmitThrottleRef.current) {
      window.clearTimeout(typingEmitThrottleRef.current);
      typingEmitThrottleRef.current = null;
    }
    if (!conversationId || !isTypingRef.current) return;
    emitStopTyping(conversationId);
    isTypingRef.current = false;
  }

  async function reportMessage(messageId: string) {
    const reason = window.prompt("Alasan report message ini?");
    if (!reason?.trim()) return;
    await useFeedStore
      .getState()
      .reportTarget("message", messageId, reason.trim());
    window.alert("Report terkirim.");
  }

  async function addGroupMember() {
    if (!conversationId || !memberToAdd) return;
    setGroupActionStatus(null);
    try {
      await useChatStore.getState().addGroupMember(conversationId, memberToAdd);
      setMemberToAdd("");
      setGroupActionStatus("Member added.");
    } catch {
      setGroupActionStatus("Failed to add member.");
    }
  }

  async function confirmRemoveGroupMember(userId: string) {
    if (!conversationId) return;
    setGroupActionStatus(null);
    try {
      await useChatStore.getState().removeGroupMember(conversationId, userId);
      setPendingRemoveUserId(null);
      setGroupActionStatus("Member removed.");
    } catch {
      setGroupActionStatus("Failed to remove member.");
    }
  }

  async function transferGroupOwner() {
    if (!conversationId || !ownerTransferTargetId) return;
    setGroupActionStatus(null);
    try {
      await useChatStore
        .getState()
        .transferGroupOwner(conversationId, ownerTransferTargetId);
      setOwnerTransferTargetId("");
      setGroupActionStatus("Owner transferred.");
    } catch {
      setGroupActionStatus("Failed to transfer owner.");
    }
  }

  async function leaveGroup() {
    if (!conversationId) return;
    setGroupActionStatus(null);
    try {
      await useChatStore.getState().leaveGroup(conversationId);
      setConfirmLeave(false);
      setShowGroupInfo(false);
      navigate("/chat");
    } catch {
      setGroupActionStatus(
        isGroupOwner && groupParticipants.length > 1
          ? "Transfer ownership before leaving."
          : "Failed to leave group.",
      );
    }
  }

  function closeUnavailableRoom() {
    if (conversationId) useChatStore.getState().setActiveConversation(null);
    navigate("/chat");
  }

  function resizeComposer() {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 132);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submitMessage();
  }

  async function handleMessagesScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    isNearBottomRef.current = isNearBottom(container);
    if (
      !conversationId ||
      loadingOlder ||
      !hasOlderMessages ||
      container.scrollTop > 80
    )
      return;

    const previousHeight = container.scrollHeight;
    const previousTop = container.scrollTop;
    suppressNextAutoScrollRef.current = true;
    await useChatStore.getState().loadOlderMessages(conversationId);
    requestAnimationFrame(() => {
      if (!container) return;
      container.scrollTop =
        container.scrollHeight - previousHeight + previousTop;
      isNearBottomRef.current = isNearBottom(container);
    });
  }

  if (roomAccessError && !currentConversation) {
    return (
      <section className="mx-auto flex min-h-[18rem] max-w-xl flex-col items-center justify-center rounded-xl border border-gray-800 bg-gray-950 p-6 text-center shadow-neon">
        <h1 className="text-lg font-semibold text-gray-100">
          Conversation unavailable
        </h1>
        <p className="mt-2 text-sm text-gray-500">{roomAccessError}</p>
        <button
          className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          onClick={closeUnavailableRoom}
          type="button"
        >
          Back to chats
        </button>
      </section>
    );
  }

  return (
    <section className="flex h-[calc(100dvh-10rem)] min-h-0 w-full max-w-full flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-neon sm:h-[calc(100dvh-5rem)]">
      <div className="flex min-w-0 shrink-0 flex-col gap-3 border-b border-gray-800 bg-gray-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-100">
            {conversationTitle}
          </h1>
          <p className="text-sm text-gray-500">
            {currentConversation?.type === "GROUP" ? (
              `${currentConversation.participants.length} members`
            ) : (
              <>
                <span
                  className={
                    isOtherUserOnline ? "text-emerald-400" : "text-gray-600"
                  }
                >
                  *
                </span>{" "}
                {isOtherUserOnline ? "Online" : "Last seen recently"}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {currentConversation?.type === "GROUP" ? (
            <button
              className="h-9 rounded-lg bg-gray-800 px-3 text-sm font-medium text-gray-100 transition hover:bg-gray-700"
              onClick={() => setShowGroupInfo(true)}
              type="button"
            >
              Group Info
            </button>
          ) : null}
          <Link
            to="/chat"
            className="h-9 rounded-lg px-3 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/10"
          >
            Back
          </Link>
        </div>
      </div>

      {isBrowserOffline || socketState !== "connected" ? (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          {isBrowserOffline
            ? "You are offline. Messages will refresh after reconnect."
            : socketState === "reconnecting"
              ? "Reconnecting this conversation..."
              : "Realtime connection is offline."}
        </div>
      ) : null}

      {currentConversation?.type === "GROUP" && showGroupInfo ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
          <div className="max-h-[86dvh] w-full max-w-lg overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 p-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-100">
                  {conversationTitle}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {groupParticipants.length} members
                </p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                onClick={() => setShowGroupInfo(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(86dvh-5rem)] overflow-y-auto p-4">
              <p className="text-sm font-semibold text-gray-200">Members</p>
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                {groupParticipants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-gray-900 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-100">
                        {participant.user.displayName}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        @{participant.user.username}
                      </p>
                    </div>
                    {participant.userId === currentConversation.ownerId ? (
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                        Owner
                      </span>
                    ) : participant.userId !== currentUser?.id ? (
                      pendingRemoveUserId === participant.userId ? (
                        <div className="flex shrink-0 gap-1">
                          <button
                            className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30"
                            onClick={() =>
                              void confirmRemoveGroupMember(participant.userId)
                            }
                            type="button"
                          >
                            Confirm
                          </button>
                          <button
                            className="rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-800"
                            onClick={() => setPendingRemoveUserId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/10"
                          onClick={() =>
                            setPendingRemoveUserId(participant.userId)
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      )
                    ) : (
                      <span className="shrink-0 rounded-full bg-purple-500/10 px-2 py-1 text-xs text-purple-200">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold text-gray-200">
                Add friend
              </p>
              <select
                className="mt-2 h-10 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 text-sm text-gray-100 outline-none focus:border-purple-500"
                value={memberToAdd}
                onChange={(event) => setMemberToAdd(event.target.value)}
              >
                <option value="">Select friend</option>
                {availableGroupMembers.map((user) => (
                  <option key={user.id} value={user.id}>
                    @{user.username}
                  </option>
                ))}
              </select>
              {availableGroupMembers.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">
                  No friends available to add.
                </p>
              ) : null}
              <button
                className="mt-2 h-9 w-full rounded-lg bg-purple-600 px-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                disabled={!memberToAdd}
                onClick={() => void addGroupMember()}
                type="button"
              >
                Add
              </button>
              {isGroupOwner && ownerTransferCandidates.length > 0 ? (
                <>
                  <p className="mt-4 text-sm font-semibold text-gray-200">
                    Transfer owner
                  </p>
                  <select
                    className="mt-2 h-10 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 text-sm text-gray-100 outline-none focus:border-purple-500"
                    value={ownerTransferTargetId}
                    onChange={(event) =>
                      setOwnerTransferTargetId(event.target.value)
                    }
                  >
                    <option value="">Select member</option>
                    {ownerTransferCandidates.map((participant) => (
                      <option
                        key={participant.userId}
                        value={participant.userId}
                      >
                        @{participant.user.username}
                      </option>
                    ))}
                  </select>
                  <button
                    className="mt-2 h-9 w-full rounded-lg bg-gray-800 px-3 text-sm font-medium text-gray-100 hover:bg-gray-700 disabled:opacity-60"
                    disabled={!ownerTransferTargetId}
                    onClick={() => void transferGroupOwner()}
                    type="button"
                  >
                    Transfer ownership
                  </button>
                </>
              ) : null}
              <button
                className="mt-2 h-9 w-full rounded-lg bg-red-500/10 px-3 text-sm font-medium text-red-200 hover:bg-red-500/20"
                onClick={() => setConfirmLeave(true)}
                type="button"
              >
                Leave group
              </button>
              {confirmLeave ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className="h-9 rounded-lg bg-red-500/20 px-3 text-sm font-medium text-red-100 hover:bg-red-500/30"
                    onClick={() => void leaveGroup()}
                    type="button"
                  >
                    Confirm
                  </button>
                  <button
                    className="h-9 rounded-lg bg-gray-800 px-3 text-sm font-medium text-gray-100 hover:bg-gray-700"
                    onClick={() => setConfirmLeave(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              {groupActionStatus ? (
                <p className="mt-2 text-xs text-gray-400">
                  {groupActionStatus}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.10),transparent_34%)] p-4"
        onScroll={() => void handleMessagesScroll()}
      >
        {loadingOlder ? (
          <p className="pb-2 text-center text-xs text-gray-500">
            Loading older messages...
          </p>
        ) : null}
        {messageLoadError && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="font-semibold text-red-200">
                Failed to load messages.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Check your connection and try again.
              </p>
              <button
                className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-700"
                onClick={() =>
                  conversationId &&
                  void resyncActiveConversation(conversationId)
                }
                type="button"
              >
                Retry
              </button>
            </div>
          </div>
        ) : isLoadingMessages && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="font-semibold text-gray-100">
                Start a conversation
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Send the first message when you are ready.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const mine = message.senderId === currentUser?.id;
            const previousMessage = messages[index - 1];
            const grouped =
              previousMessage?.senderId === message.senderId &&
              new Date(message.createdAt).getTime() -
                new Date(previousMessage.createdAt).getTime() <
                5 * 60 * 1000;
            const status = mine
              ? (messageStatus[message.id] ?? "sent")
              : undefined;
            const senderIdentity = resolveUserIdentity(
              message.sender,
              currentUser?.id === message.sender.id ? currentUser : undefined,
            );

            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-4"}`}
              >
                {!mine ? (
                  <div className="mr-2 flex w-8 shrink-0 justify-center">
                    {!grouped ? (
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-800 text-xs font-semibold text-purple-200">
                        {senderIdentity.avatarUrl ? (
                          <img
                            src={senderIdentity.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          senderIdentity.initial
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%] ${
                    mine
                      ? "rounded-br-md bg-purple-600 text-white shadow-lg shadow-purple-500/10"
                      : "rounded-bl-md bg-gray-800 text-gray-100"
                  }`}
                >
                  {!mine && !grouped ? (
                    <p className="mb-1 text-xs font-semibold text-gray-400">
                      {senderIdentity.displayName}
                    </p>
                  ) : null}
                  {message.metadata?.storyReply ? (
                    <div
                      className={`mb-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${mine ? "border-white/20 bg-white/10 text-purple-50" : "border-purple-500/20 bg-purple-500/10 text-purple-200"}`}
                    >
                      Replied to story
                    </div>
                  ) : null}
                  {message.body ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      <SocialText text={message.body} />
                    </p>
                  ) : null}
                  <AttachmentRenderer attachments={message.attachments} />
                  <p
                    className={`mt-1 text-right text-[11px] ${mine ? "text-purple-100/80" : "text-gray-500"}`}
                  >
                    {formatMessageTime(message.createdAt)}{" "}
                    {mine ? renderMessageStatus(status) : null}
                  </p>
                  {!mine ? (
                    <button
                      className="mt-1 text-[11px] font-semibold text-gray-500 hover:text-red-200"
                      onClick={() => void reportMessage(message.id)}
                      type="button"
                    >
                      Report
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="min-h-6 shrink-0 bg-gray-950 px-4 pb-1 text-sm text-gray-500">
        {roomAccessError
          ? roomAccessError
          : attachmentUploadError
            ? attachmentUploadError
            : isUploadingAttachment
              ? "Uploading attachment..."
              : uploadDrafts.some((draft) => draft.status === "error")
                ? "Some attachments failed. Remove them and try again."
                : interactionRestricted
                  ? "Kamu tidak bisa mengirim pesan ke user ini karena ada pembatasan interaksi."
                  : notFriend
                    ? "User ini belum menjadi teman."
                    : typingLabels.length > 0
                      ? `${typingLabels[0]} sedang mengetik...`
                      : null}
      </div>

      <form
        className="flex min-w-0 shrink-0 items-end gap-2 border-t border-gray-800 bg-gray-900 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        onSubmit={handleSubmit}
      >
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf"
          onChange={(event) => void handleAttachmentChange(event)}
        />
        <button
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-800 bg-gray-950 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          disabled={
            isUploadingAttachment ||
            selectedAttachments.length + uploadDrafts.length >=
              MAX_ATTACHMENTS ||
            interactionRestricted ||
            Boolean(roomAccessError)
          }
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          type="button"
        >
          <Paperclip size={17} />
        </button>
        <div className="min-w-0 flex-1">
          {selectedAttachments.length > 0 || uploadDrafts.length > 0 ? (
            <div className="mb-2">
              <MediaDraftPreview
                items={[
                  ...selectedAttachments.map((attachment) => ({
                    id: attachment.id,
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    url: attachment.publicUrl ?? null,
                    name: attachmentLabel(attachment),
                    status: "ready" as const,
                  })),
                  ...uploadDrafts,
                ]}
                onRemove={(id) => {
                  setSelectedAttachments((current) =>
                    current.filter((item) => item.id !== id),
                  );
                  setUploadDrafts((current) => clearDrafts(current, [id]));
                }}
              />
            </div>
          ) : null}
          <textarea
            ref={composerRef}
            className="min-h-11 w-full resize-none rounded-2xl border border-gray-800 bg-gray-950 px-4 py-2.5 text-sm leading-5 text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
            name="body"
            placeholder={
              selectedAttachments.length > 0 ? "Add a caption..." : "Message..."
            }
            autoComplete="off"
            rows={1}
            value={draftMessage}
            onChange={handleMessageChange}
            onKeyDown={handleMessageKeyDown}
            disabled={interactionRestricted || Boolean(roomAccessError)}
          />
        </div>
        <Button
          className="h-10 w-10 rounded-full px-0"
          title="Send message"
          disabled={
            (!draftMessage.trim() && selectedAttachments.length === 0) ||
            isSending ||
            isUploadingAttachment ||
            uploadDrafts.length > 0 ||
            interactionRestricted ||
            Boolean(roomAccessError)
          }
        >
          <Send size={17} />
        </Button>
      </form>
    </section>
  );
}

async function resyncActiveConversation(conversationId: string) {
  rtTrace(`loadMessages:start conversation:${conversationId}`);
  await useChatStore.getState().loadMessages(conversationId);
  rtTrace(`loadMessages:end conversation:${conversationId}`);
  rtTrace(`markConversationRead:start conversation:${conversationId}`);
  await useChatStore.getState().markConversationRead(conversationId);
  rtTrace(`markConversationRead:end conversation:${conversationId}`);
  rtTrace(
    `loadConversations:start after-active-room conversation:${conversationId}`,
  );
  await useChatStore.getState().loadConversations();
  rtTrace(
    `loadConversations:end after-active-room conversation:${conversationId}`,
  );
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function isNearBottom(container: HTMLDivElement) {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight < 80
  );
}

function renderMessageStatus(status?: MessageStatus) {
  if (status === "sending") return "...";
  if (status === "error") return "!";
  if (status === "read") return "read";
  return "sent";
}

function attachmentLabel(asset: MediaAsset) {
  if (asset.mimeType.startsWith("image/")) return "Image";
  if (asset.mimeType.startsWith("video/")) return "Video";
  if (asset.mimeType.startsWith("audio/")) return "Audio";
  if (asset.mimeType === "application/pdf") return "PDF";
  return "File";
}

function clearDrafts(current: UploadDraft[], ids: string[]) {
  const idSet = new Set(ids);
  current.forEach((draft) => {
    if (idSet.has(draft.id) && draft.url) URL.revokeObjectURL(draft.url);
  });
  return current.filter((draft) => !idSet.has(draft.id));
}

function rtTrace(message: string, details?: Record<string, unknown>) {
  console.info(`[RT-TRACE] ${message}`, {
    at: new Date().toISOString(),
    ...details,
  });
}
