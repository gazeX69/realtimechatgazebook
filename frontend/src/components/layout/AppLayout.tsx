import { Bell, Compass, Hash, Image, LogOut, MessageSquare, Newspaper, Sparkles, UserCircle, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiClient, apiData, apiEnvelope } from '../../lib/api-client';
import { resolveActorIdentity, resolveUserIdentity } from '../../lib/identity-resolver';
import { mediaPreviewInfo } from '../../lib/media-preview';
import { resolveMedia } from '../../lib/media-resolver';
import { recentPostAuthors, SidebarUser, trendingHashtags } from '../../lib/social-insights';
import { disconnectSocket, getSocket, getSocketConnectionState, subscribeSocketConnectionState, SocketConnectionState } from '../../lib/socket-client';
import { useAuthStore } from '../../stores/auth-store';
import { FeedComment, FeedPost, useFeedStore } from '../../stores/feed-store';
import { useFriendStore } from '../../stores/friend-store';
import { useFollowStore } from '../../stores/follow-store';
import { useChatStore } from '../../stores/chat-store';
import { AppNotification, useNotificationStore } from '../../stores/notification-store';
import { DiscoveryUser } from '../../features/users/UserDiscovery';
import { normalizePost } from '../../lib/api-normalizer';
import { Button } from '../ui/Button';
import { NotificationBell } from './NotificationBell';

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const totalUnread = useChatStore((state) => state.conversations.reduce((total, conversation) => total + conversation.unreadCount, 0));
  const notificationUnread = useNotificationStore((state) => state.unreadCount);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [socketState, setSocketState] = useState<SocketConnectionState>(() => getSocketConnectionState());
  const [isBrowserOffline, setIsBrowserOffline] = useState(() => !navigator.onLine);
  const currentIdentity = resolveUserIdentity(user);

  useEffect(() => {
    return subscribeSocketConnectionState(setSocketState);
  }, []);

  useEffect(() => {
    const handleOffline = () => setIsBrowserOffline(true);
    const handleOnline = () => setIsBrowserOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void useNotificationStore.getState().fetchNotifications();
    void useNotificationStore.getState().fetchUnreadCount();
    void useChatStore.getState().loadConversations();
    const socket = getSocket();
    const handleMessageNew = (payload: {
      conversationId: string;
      message: { id: string; body: string; createdAt: string };
      sender: { id: string; username: string; displayName: string; avatarUrl?: string | null };
      emittedAt?: string;
    }) => {
      rtTrace(`message.new conversation:${payload.conversationId}`, { messageId: payload.message.id });
      logLatency('message.new', payload.emittedAt);
      useChatStore.getState().applyIncomingMessageNotification(payload);
    };
    const handleMessageRead = (payload: { conversationId?: string; messageIds?: string[]; readerId?: string }) => {
      if (!payload.conversationId || !payload.readerId || !payload.messageIds?.length) return;
      useChatStore.getState().setMessagesRead(payload.conversationId, payload.readerId, payload.messageIds);
    };
    const handleNotification = (notification: AppNotification) => {
      if (notification.userId !== user.id) return;
      useNotificationStore.getState().applyRealtimeNotification(notification);
    };
    const handlePresenceSnapshot = (payload: { userIds?: string[] }) => {
      rtTrace('presence.snapshot', { count: payload.userIds?.length ?? 0 });
      useChatStore.getState().setOnlineUsers(payload.userIds ?? []);
    };
    const handleUserOnline = (payload: { userId?: string }) => {
      if (payload.userId) useChatStore.getState().setUserOnline(payload.userId);
    };
    const handleUserOffline = (payload: { userId?: string }) => {
      if (payload.userId) useChatStore.getState().setUserOffline(payload.userId);
    };
    const handlePostCreated = (post: FeedPost) => {
      const scope = useFeedStore.getState().currentScope;
      const isOwnPost = post.user.id === user.id;

      if (isOwnPost) {
        // biarkan, karena sudah di-handle oleh createPost
        return;
      }

      if (scope === 'global') {
        useFeedStore.getState().applyRealtimePost(post);
      }
      // if (scope === 'global' || post.user.id === user.id) useFeedStore.getState().applyRealtimePost(post);
      // else void useFeedStore.getState().fetchFeed(scope);
    };
    const handlePostReacted = (payload: { postId: string; likeCount: number; userId: string; likedByMe: boolean }) => {
      useFeedStore.getState().applyRealtimeReaction(payload, user.id);
    };
    const handleCommentCreated = (payload: { postId?: string; comment?: FeedComment; commentCount?: number }) => {
      if (!payload.postId || !payload.comment) return;
      useFeedStore.getState().applyRealtimeComment(payload.postId, payload.comment, payload.commentCount);
    };
    const handleUserFollowed = (payload: { followerId?: string; targetUserId?: string }) => {
      useFollowStore.getState().applyFollowEvent(payload, user.id, true);
    };
    const handleUserUnfollowed = (payload: { followerId?: string; targetUserId?: string }) => {
      useFollowStore.getState().applyFollowEvent(payload, user.id, false);
    };
    const handleFriendEvent = (payload: { requesterId?: string; addresseeId?: string; friendshipId?: string; status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' }) => {
      useFriendStore.getState().applyFriendEvent(payload, user.id);
    };
    const handleReconnectSync = () => {
      rtTrace('connect AppLayout:sync');
      void tracePromise('AppLayout loadConversations', useChatStore.getState().loadConversations());
      void tracePromise('AppLayout fetchNotifications', useNotificationStore.getState().fetchNotifications());
      void tracePromise('AppLayout fetchUnreadCount', useNotificationStore.getState().fetchUnreadCount());
      void tracePromise('AppLayout fetchFeed', useFeedStore.getState().fetchFeed(useFeedStore.getState().currentScope));
    };
    socket.connect();
    socket.on('message.new', handleMessageNew);
    socket.on('message.read', handleMessageRead);
    socket.off('notification.new', handleNotification);
    socket.on('notification.new', handleNotification);
    socket.on('presence.snapshot', handlePresenceSnapshot);
    socket.on('user.online', handleUserOnline);
    socket.on('user.offline', handleUserOffline);
    socket.on('post.created', handlePostCreated);
    socket.on('post.reacted', handlePostReacted);
    socket.on('comment.created', handleCommentCreated);
    socket.on('user.followed', handleUserFollowed);
    socket.on('user.unfollowed', handleUserUnfollowed);
    socket.on('friend.requested', handleFriendEvent);
    socket.on('friend.accepted', handleFriendEvent);
    socket.on('friend.rejected', handleFriendEvent);
    socket.on('connect', handleReconnectSync);
    return () => {
      socket.off('message.new', handleMessageNew);
      socket.off('message.read', handleMessageRead);
      socket.off('notification.new', handleNotification);
      socket.off('presence.snapshot', handlePresenceSnapshot);
      socket.off('user.online', handleUserOnline);
      socket.off('user.offline', handleUserOffline);
      socket.off('post.created', handlePostCreated);
      socket.off('post.reacted', handlePostReacted);
      socket.off('comment.created', handleCommentCreated);
      socket.off('user.followed', handleUserFollowed);
      socket.off('user.unfollowed', handleUserUnfollowed);
      socket.off('friend.requested', handleFriendEvent);
      socket.off('friend.accepted', handleFriendEvent);
      socket.off('friend.rejected', handleFriendEvent);
      socket.off('connect', handleReconnectSync);
    };
  }, [user?.id]);

  useEffect(() => {
    const handleAuthExpired = () => {
      disconnectSocket();
      useAuthStore.setState({ user: null, isLoading: false });
      useChatStore.setState({
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
        activeConversationId: null,
        onlineUserIds: [],
        typingUsersByConversation: {},
      });
      navigate('/login', { replace: true });
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [navigate]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-950 text-gray-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-gray-800 bg-gray-950/95 px-3 py-4 backdrop-blur lg:block">
        <Link to="/feed" className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 shadow-lg shadow-purple-500/20">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="font-bold tracking-wide">Realtime Hub</p>
            <p className="text-xs text-gray-500">social layer</p>
          </div>
        </Link>

        <nav className="mt-7 space-y-1.5">
          <SidebarLink icon={<Newspaper size={19} />} label="Feed" to="/feed" />
          <SidebarLink icon={<Compass size={19} />} label="Explore" to="/explore" />
          <SidebarLink icon={<UserPlus size={19} />} label="Friends" to="/friends" />
          <SidebarLink icon={<MessageSquare size={19} />} label="Chat" to="/chat" badge={totalUnread} />
          <SidebarLink icon={<Bell size={19} />} label="Notifications" to="/notifications" badge={notificationUnread} />
          {user ? <SidebarLink icon={<UserCircle size={19} />} label="Profile" to={`/users/${user.id}`} /> : null}
        </nav>

        <div className="absolute bottom-4 left-3 right-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
              {currentIdentity.avatarUrl ? <img src={currentIdentity.avatarUrl} alt="" className="h-full w-full object-cover" /> : currentIdentity.initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{currentIdentity.displayName}</p>
              <p className="truncate text-xs text-gray-500">@{currentIdentity.username}</p>
            </div>
          </div>
          <Button className="mt-3 h-9 w-full bg-gray-800 shadow-none hover:bg-purple-600" onClick={handleLogout}>
            <LogOut size={15} />
            Logout
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <Link to="/feed" className="font-bold">Realtime Hub</Link>
          <div className="flex items-center gap-2">
            {user ? (
              <NavLink
                to={`/users/${user.id}`}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30"
                aria-label="Profile"
                title="Profile"
              >
                {currentIdentity.avatarUrl ? <img src={currentIdentity.avatarUrl} alt="" className="h-full w-full object-cover" /> : currentIdentity.initial}
              </NavLink>
            ) : null}
            <NavLink to="/chat" className="relative rounded-lg p-2 text-gray-300 hover:bg-purple-500/10">
              <MessageSquare size={19} />
              {totalUnread > 0 ? <Badge value={totalUnread} /> : null}
            </NavLink>
            <NotificationBell />
          </div>
        </div>
      </header>

      <div className="min-w-0 max-w-full overflow-x-hidden lg:pl-60 xl:pr-72">
        <main className="mx-auto min-h-screen w-full max-w-3xl overflow-x-hidden px-4 pb-24 pt-4 sm:px-5 lg:py-6">
          {user && (isBrowserOffline || socketState !== 'connected') ? (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {isBrowserOffline ? 'You are offline. Realtime updates are paused.' : socketState === 'reconnecting' ? 'Reconnecting realtime updates...' : 'Realtime updates are offline.'}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <aside className="fixed inset-y-0 right-0 hidden w-72 overflow-y-auto border-l border-gray-800 bg-gray-950/95 px-4 py-6 xl:block">
        <RightPanel pathname={location.pathname} />
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-800 bg-gray-950/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          <MobileLink icon={<Newspaper size={19} />} label="Feed" to="/feed" />
          <MobileLink icon={<Compass size={19} />} label="Explore" to="/explore" />
          <MobileLink icon={<MessageSquare size={19} />} label="Chat" to="/chat" badge={totalUnread} />
          <MobileLink icon={<Bell size={19} />} label="Alerts" to="/notifications" badge={notificationUnread} />
          {user ? <MobileLink icon={<UserCircle size={19} />} label="Profile" to={`/users/${user.id}`} /> : null}
        </div>
      </nav>

    </div>
  );
}

function SidebarLink({ icon, label, to, badge }: { icon: ReactNode; label: string; to: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-150 ${
          isActive ? 'bg-purple-500/20 text-purple-100 shadow-lg shadow-purple-500/10' : 'text-gray-400 hover:bg-purple-500/10 hover:text-gray-100'
        }`
      }
    >
      <span className="flex items-center gap-3">
        {icon}
        {label}
      </span>
      {badge && badge > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{formatBadgeValue(badge)}</span> : null}
    </NavLink>
  );
}

function MobileLink({ icon, label, to, badge }: { icon: ReactNode; label: string; to: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition duration-150 sm:text-[11px] ${
          isActive ? 'bg-purple-500/20 text-purple-100' : 'text-gray-500 hover:bg-purple-500/10 hover:text-gray-100'
        }`
      }
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
      {badge && badge > 0 ? <span className="absolute right-1 top-0.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{formatBadgeValue(badge)}</span> : null}
    </NavLink>
  );
}

function RightPanel({ pathname }: { pathname: string }) {
  if (pathname.startsWith('/chat')) {
    return (
      <Panel title="Online Now">
        <p className="text-sm text-gray-400">Your active conversations and presence live in Chat.</p>
      </Panel>
    );
  }

  if (pathname.startsWith('/explore')) {
    return <ExploreRightPanel />;
  }

  if (pathname.startsWith('/users/')) return <ProfileRightPanel userId={pathname.split('/')[2]} />;

  return <FeedRightPanel />;
}

function FeedRightPanel() {
  return (
    <div className="space-y-4">
      <SidebarSuggestedUsers />
      <SidebarRecentActivity />
    </div>
  );
}

function ExploreRightPanel() {
  const posts = useFeedStore((state) => state.posts);
  const hashtags = useMemo(() => trendingHashtags(posts), [posts]);
  const latestAuthors = useMemo(() => recentPostAuthors(posts), [posts]);

  return (
    <div className="space-y-4">
      <Panel title="Trending Hashtags">
        {hashtags.length === 0 ? (
          <EmptyPanelText>No hashtags in recent posts.</EmptyPanelText>
        ) : (
          <div className="space-y-2">
            {hashtags.map((item) => (
              <Link key={item.tag} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm transition hover:bg-purple-500/10" to={`/explore?tag=${item.tag}`}>
                <span className="flex min-w-0 items-center gap-2 font-semibold text-sky-200">
                  <Hash size={14} />
                  <span className="truncate">{item.tag}</span>
                </span>
                <span className="text-xs text-gray-500">{item.count}</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Latest Public Users">
        <SidebarUserList users={latestAuthors} emptyText="No public authors yet." />
      </Panel>
    </div>
  );
}

function ProfileRightPanel({ userId }: { userId?: string }) {
  const profile = useFollowStore((state) => (userId ? state.profiles[userId] : undefined));
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!useFollowStore.getState().profiles[userId]) void useFollowStore.getState().fetchProfile(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    apiEnvelope<FeedPost[]>(apiClient.get('/feed', { params: { userId, limit: 8 } }))
      .then((response) => setPosts(response.data.map(normalizePost)))
      .finally(() => setLoading(false));
  }, [userId]);

  const mediaItems = posts.flatMap((post) => post.media.map((media) => ({ postId: post.id, media }))).slice(0, 6);

  return (
    <div className="space-y-4">
      <Panel title="Profile Snapshot">
        {!profile ? (
          <EmptyPanelText>Loading profile...</EmptyPanelText>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <ProfileMetric label="Followers" value={profile.followerCount} />
            <ProfileMetric label="Following" value={profile.followingCount} />
            <ProfileMetric label="Posts" value={profile.postCount} />
          </div>
        )}
      </Panel>
      <Panel title="Recent Media">
        {loading ? <EmptyPanelText>Loading media...</EmptyPanelText> : null}
        {!loading && mediaItems.length === 0 ? (
          <EmptyPanelText>No recent media.</EmptyPanelText>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {mediaItems.map((item) => (
              <Link key={`${item.postId}-${item.media.id ?? item.media.mediaAssetId ?? item.media.orderIndex}`} className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gray-800 bg-gray-950 hover:border-purple-500/60" to={`/users/${userId}`}>
                <ProfileMediaThumb media={item.media} />
              </Link>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Recent Activity">
        {posts.length === 0 ? (
          <EmptyPanelText>No recent profile activity.</EmptyPanelText>
        ) : (
          <div className="space-y-2">
            {posts.slice(0, 4).map((post) => (
              <Link key={post.id} className="block rounded-lg px-2 py-2 text-sm text-gray-300 hover:bg-purple-500/10 hover:text-gray-100" to={`/users/${post.user.id}`}>
                <span className="line-clamp-2">{post.body || `${post.media.length} media post`}</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SidebarSuggestedUsers() {
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiData<DiscoveryUser[]>(apiClient.get('/users/suggested'))
      .then((items) => setUsers(items.slice(0, 5)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Suggested Users">
      {loading ? <EmptyPanelText>Loading users...</EmptyPanelText> : null}
      {!loading && users.length === 0 ? <EmptyPanelText>No suggestions yet.</EmptyPanelText> : null}
      <div className="space-y-3">
        {users.map((user) => (
          <SuggestedUserRow key={user.id} user={user} />
        ))}
      </div>
    </Panel>
  );
}

function SidebarRecentActivity() {
  const notifications = useNotificationStore((state) => state.notifications);
  const profiles = useFollowStore((state) => state.profiles);
  const posts = useFeedStore((state) => state.posts);
  const recentAuthors = useMemo(() => recentPostAuthors(posts, 5), [posts]);
  const items = notifications.slice(0, 5);

  return (
    <Panel title="Recent Activity">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((notification) => (
            <Link key={notification.id} className="block rounded-lg px-2 py-2 text-sm transition hover:bg-purple-500/10" to={notificationLink(notification.data)}>
              <p className="truncate font-semibold text-gray-100">{resolveActorIdentity(notification.data, actorProfile(notification.data, profiles)).displayName}</p>
              <p className="line-clamp-2 text-xs text-gray-500">{labelForNotification(notification.type)}</p>
            </Link>
          ))}
        </div>
      ) : recentAuthors.length > 0 ? (
        <div className="space-y-2">
          {recentAuthors.map((author) => (
            <Link key={author.id} className="block rounded-lg px-2 py-2 text-sm text-gray-300 hover:bg-purple-500/10 hover:text-gray-100" to={`/users/${author.id}`}>
              @{author.username} baru posting
            </Link>
          ))}
        </div>
      ) : (
        <EmptyPanelText>No recent activity yet.</EmptyPanelText>
      )}
    </Panel>
  );
}

function SuggestedUserRow({ user }: { user: DiscoveryUser }) {
  const [isFollowing, setIsFollowing] = useState(user.isFollowing);
  const [friendState, setFriendState] = useState(user.isFriend ? 'friend' : user.outgoingFriendRequest ? 'pending' : user.incomingFriendRequest ? 'incoming' : 'none');
  const [busy, setBusy] = useState<string | null>(null);
  const identity = resolveUserIdentity(user);

  async function follow() {
    if (busy || !user.canInteract) return;
    setBusy('follow');
    const next = !isFollowing;
    setIsFollowing(next);
    try {
      if (next) await apiClient.post(`/users/${user.id}/follow`);
      else await apiClient.delete(`/users/${user.id}/follow`);
    } catch {
      setIsFollowing(!next);
    } finally {
      setBusy(null);
    }
  }

  async function addFriend() {
    if (busy || !user.canInteract || friendState !== 'none') return;
    setBusy('friend');
    try {
      await useFriendStore.getState().requestFriend(user.id);
      setFriendState('pending');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-2">
      <Link to={`/users/${user.id}`} className="flex min-w-0 items-center gap-2">
        <SidebarAvatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
          <p className="truncate text-xs text-gray-500">@{identity.username}</p>
        </div>
      </Link>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="h-8 rounded-lg bg-purple-600 px-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-60" disabled={busy === 'follow' || !user.canInteract} onClick={() => void follow()} type="button">
          {isFollowing ? 'Following' : 'Follow'}
        </button>
        <button className="h-8 rounded-lg bg-gray-800 px-2 text-xs font-semibold text-gray-100 hover:bg-gray-700 disabled:opacity-60" disabled={busy === 'friend' || !user.canInteract || friendState !== 'none'} onClick={() => void addFriend()} type="button">
          {friendState === 'friend' ? 'Friend' : friendState === 'pending' ? 'Pending' : friendState === 'incoming' ? 'Incoming' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function SidebarUserList({ users, emptyText }: { users: SidebarUser[]; emptyText: string }) {
  if (users.length === 0) return <EmptyPanelText>{emptyText}</EmptyPanelText>;
  return (
    <div className="space-y-2">
      {users.map((user) => {
        const identity = resolveUserIdentity(user);
        return (
          <Link key={user.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-purple-500/10" to={`/users/${user.id}`}>
            <SidebarAvatar user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
              <p className="truncate text-xs text-gray-500">@{identity.username}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function SidebarAvatar({ user }: { user: SidebarUser }) {
  const identity = resolveUserIdentity(user);
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-xs font-semibold text-purple-200 ring-1 ring-purple-500/30">
      {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : identity.initial}
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-950 px-2 py-2">
      <p className="text-sm font-semibold text-gray-100">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function ProfileMediaThumb({ media }: { media: FeedPost['media'][number] }) {
  const url = resolveMedia(media.mediaAsset?.publicUrl ?? media.publicUrl ?? media.fileUrl);
  const info = mediaPreviewInfo(media.mimeType);
  if (info.kind === 'image' && url) return <img src={url} alt="" className="h-full w-full object-cover" />;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-gray-400">
      {info.kind === 'video' ? <Image size={17} /> : <info.Icon size={17} />}
      <span>{info.label}</span>
    </div>
  );
}

function EmptyPanelText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon">
      <h2 className="mb-3 text-sm font-semibold text-gray-100">{title}</h2>
      {children}
    </section>
  );
}

function labelForNotification(type: string) {
  const labels: Record<string, string> = {
    'user.followed': 'mengikuti kamu',
    'friend.request.sent': 'mengirim permintaan teman',
    'friend.request.accepted': 'menerima permintaan teman',
    'post.reacted': 'menyukai post kamu',
    'post.commented': 'mengomentari post kamu',
    'comment.replied': 'membalas komentarmu',
    'user.mentioned': 'menyebut kamu',
    'message.new': 'mengirim pesan baru',
  };
  return labels[type] ?? 'aktivitas baru';
}

function actorProfile(data: Record<string, unknown>, profiles: Record<string, SidebarUser>) {
  const actorId = typeof data.actorId === 'string' ? data.actorId : null;
  return actorId ? profiles[actorId] : undefined;
}

function notificationLink(data: Record<string, unknown>) {
  if (typeof data.conversationId === 'string') return '/chat';
  if (typeof data.actorId === 'string') return `/users/${data.actorId}`;
  if (typeof data.targetUserId === 'string') return `/users/${data.targetUserId}`;
  if (typeof data.postId === 'string') return '/feed';
  return '/notifications';
}

function NotificationBellBadge({ value }: { value: number }) {
  return <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{formatBadgeValue(value)}</span>;
}

const Badge = NotificationBellBadge;

function formatBadgeValue(value: number) {
  return value > 99 ? '99+' : value;
}

function logLatency(event: string, emittedAt?: string) {
  if (!emittedAt || import.meta.env.PROD) return;
  console.log(`[realtime] ${event} latency=${Date.now() - new Date(emittedAt).getTime()}ms`);
}

function rtTrace(message: string, details?: Record<string, unknown>) {
  console.info(`[RT-TRACE] ${message}`, { at: new Date().toISOString(), ...details });
}

async function tracePromise(label: string, promise: Promise<unknown>) {
  rtTrace(`${label}:start`);
  try {
    await promise;
    rtTrace(`${label}:end`);
  } catch (error) {
    rtTrace(`${label}:error`, { message: error instanceof Error ? error.message : 'unknown' });
  }
}
