import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { resolveActorIdentity, UserIdentityLike } from '../../lib/identity-resolver';
import { useFollowStore } from '../../stores/follow-store';
import { useNotificationStore } from '../../stores/notification-store';

export function NotificationPage() {
  const notifications = useNotificationStore((state) => state.notifications);
  const profiles = useFollowStore((state) => state.profiles);

  useEffect(() => {
    void useNotificationStore.getState().fetchNotifications();
    void useNotificationStore.getState().fetchUnreadCount();
  }, []);

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-neon">
      <div className="flex items-center justify-between border-b border-gray-800 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Activity</p>
          <h1 className="text-lg font-semibold text-gray-100">Notifications</h1>
        </div>
        <Button className="h-9" onClick={() => void useNotificationStore.getState().markAllRead()}>
          Mark all read
        </Button>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        {notifications.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-xl">•</div>
            <p className="mt-3 font-semibold text-gray-100">No notifications yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Likes, comments, mentions, and friend activity will show up here.</p>
          </div>
        ) : null}
        {notifications.map((notification) => (
          <Link
            key={notification.id}
            to={notificationLink(notification.data)}
            className={`group relative flex min-w-0 cursor-pointer gap-3 rounded-xl border p-4 transition duration-150 active:scale-[0.99] md:hover:-translate-y-0.5 md:hover:bg-purple-500/10 md:hover:shadow-lg md:hover:shadow-purple-500/10 ${
              notification.readAt ? 'border-gray-800 bg-gray-950/40' : 'border-purple-500/25 bg-purple-500/[0.13]'
            }`}
            onClick={() => void useNotificationStore.getState().markRead(notification.id)}
          >
            <NotificationAvatar data={notification.data} profile={actorProfile(notification.data, profiles)} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-bold ${notification.readAt ? 'text-gray-200' : 'text-gray-100'}`}>
                    {resolveActorIdentity(notification.data, actorProfile(notification.data, profiles)).displayName}
                  </p>
                  <p className={`mt-1 text-sm leading-5 ${notification.readAt ? 'text-gray-500' : 'text-gray-300'}`}>
                    {labelFor(notification.type)}
                  </p>
                </div>
                <p className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-gray-500">
                  {formatTime(notification.createdAt)}
                </p>
              </div>
            </div>
            {!notification.readAt ? <span className="absolute left-0 top-4 h-8 w-1 rounded-r-full bg-purple-400" /> : null}
          </Link>
        ))}
      </div>
    </div>
  );
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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-100 ring-1 ring-purple-500/30">
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
