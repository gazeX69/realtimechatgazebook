import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveActorIdentity, UserIdentityLike } from '../../lib/identity-resolver';
import { useFollowStore } from '../../stores/follow-store';
import { useNotificationStore } from '../../stores/notification-store';

export function NotificationBell() {
  const unread = useNotificationStore((state) => state.unreadCount);
  const notifications = useNotificationStore((state) => state.notifications);
  const profiles = useFollowStore((state) => state.profiles);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewItems = notifications.slice(0, 10);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        className="relative rounded-lg p-2 text-gray-400 transition duration-150 hover:bg-purple-500/10 hover:text-gray-100 active:scale-95"
        onClick={() => setOpen((current) => !current)}
        title="Notifications"
        type="button"
        aria-expanded={open}
        aria-label="Show notification preview"
      >
        <Bell size={19} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
            {formatBadgeValue(unread)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl shadow-purple-500/20">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <p className="text-sm font-semibold text-gray-100">Notifications</p>
            <span className="text-xs text-gray-500">{previewItems.length}/10</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {previewItems.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-400">No notifications yet.</p>
            ) : (
              previewItems.map((notification) => (
                <button
                  key={notification.id}
                  className={`block w-full cursor-pointer px-4 py-3 text-left transition duration-150 hover:bg-purple-500/10 active:scale-[0.99] ${
                    notification.readAt ? 'bg-gray-950' : 'bg-purple-500/[0.13]'
                  }`}
                  onClick={() => {
                    setOpen(false);
                    void useNotificationStore.getState().markRead(notification.id);
                    navigate(notificationLink(notification.data));
                  }}
                  type="button"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <NotificationAvatar data={notification.data} profile={actorProfile(notification.data, profiles)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-gray-100">{resolveActorIdentity(notification.data, actorProfile(notification.data, profiles)).displayName}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-400">{labelFor(notification.type)}</p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-gray-500">{formatTime(notification.createdAt)}</p>
                      </div>
                      {!notification.readAt ? <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-purple-400 shadow shadow-purple-400/40" /> : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            className="block w-full border-t border-gray-800 px-4 py-3 text-center text-sm font-semibold text-purple-300 transition hover:bg-purple-500/10 hover:text-purple-100"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            type="button"
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatBadgeValue(value: number) {
  return value > 99 ? '99+' : value;
}

function labelFor(type: string) {
  const labels: Record<string, string> = {
    'user.followed': 'Someone followed you',
    'friend.request.sent': 'Someone sent you a friend request',
    'friend.request.accepted': 'Your friend request was accepted',
    'post.reacted': 'Someone liked your post',
    'post.commented': 'Someone commented on your post',
    'comment.replied': 'Someone replied to your comment',
    'user.mentioned': 'Someone mentioned you',
  };
  return labels[type] ?? 'New notification';
}

function actorProfile(data: Record<string, unknown>, profiles: Record<string, UserIdentityLike>) {
  const actorId = typeof data.actorId === 'string' ? data.actorId : null;
  return actorId ? profiles[actorId] : undefined;
}

function NotificationAvatar({ data, profile }: { data: Record<string, unknown>; profile?: UserIdentityLike }) {
  const identity = resolveActorIdentity(data, profile);

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-100 ring-1 ring-purple-500/30">
      {identity.avatarUrl ? (
        <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        identity.initial
      )}
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function notificationLink(data: Record<string, unknown>) {
  if (typeof data.actorId === 'string') return `/users/${data.actorId}`;
  if (typeof data.targetUserId === 'string') return `/users/${data.targetUserId}`;
  return '/feed';
}
