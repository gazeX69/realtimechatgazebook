import { create } from 'zustand';
import { apiClient, apiData, apiEnvelope } from '../lib/api-client';

export type AppNotification = {
  id: string;
  userId: string;
  type: string;
  data: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
};

type NotificationState = {
  notifications: AppNotification[];
  unreadCount: number;
  notificationCursor: string | null;
  notificationHasNextPage: boolean;
  loadingMoreNotifications: boolean;
  fetchNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  applyRealtimeNotification: (notification: AppNotification) => void;
  addRealtimeNotification: (notification: AppNotification, currentUserId?: string) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  notificationCursor: null,
  notificationHasNextPage: true,
  loadingMoreNotifications: false,
  fetchNotifications: async () => {
    const response = await apiEnvelope<AppNotification[]>(apiClient.get('/notifications'));
    set((state) => ({
      notifications: mergeNotifications(response.data, state.notifications),
      notificationCursor: typeof response.meta?.nextCursor === 'string' ? response.meta.nextCursor : null,
      notificationHasNextPage: Boolean(response.meta?.hasNextPage),
    }));
  },
  loadMoreNotifications: async () => {
    const { notificationCursor, notificationHasNextPage, loadingMoreNotifications } = get();
    if (!notificationCursor || !notificationHasNextPage || loadingMoreNotifications) return;

    set({ loadingMoreNotifications: true });
    try {
      const response = await apiEnvelope<AppNotification[]>(apiClient.get('/notifications', { params: { cursor: notificationCursor } }));
      set((state) => {
        return {
          notifications: mergeNotifications(state.notifications, response.data),
          notificationCursor: typeof response.meta?.nextCursor === 'string' ? response.meta.nextCursor : null,
          notificationHasNextPage: Boolean(response.meta?.hasNextPage),
        };
      });
    } finally {
      set({ loadingMoreNotifications: false });
    }
  },
  fetchUnreadCount: async () => {
    const result = await apiData<{ count: number }>(apiClient.get('/notifications/unread-count'));
    set({ unreadCount: result.count });
  },
  applyRealtimeNotification: (notification) => {
    set((state) => {
      if (state.notifications.some((item) => item.id === notification.id)) return state;
      return {
        notifications: mergeNotifications([notification], state.notifications),
        unreadCount: notification.readAt ? state.unreadCount : state.unreadCount + 1,
      };
    });
  },
  addRealtimeNotification: (notification, currentUserId) => {
    if (notification.userId !== currentUserId) return;
    get().applyRealtimeNotification(notification);
  },
  markRead: async (id) => {
    await apiClient.post(`/notifications/${id}/read`);
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
      ),
      unreadCount: state.notifications.some((item) => item.id === id && !item.readAt) ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
    }));
  },
  markAllRead: async () => {
    await apiClient.patch('/notifications/read-all');
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      unreadCount: 0,
    }));
  },
}));

function mergeNotifications(...notificationGroups: AppNotification[][]) {
  const byId = new Map<string, AppNotification>();

  notificationGroups.flat().forEach((notification) => {
    const existing = byId.get(notification.id);
    byId.set(
      notification.id,
      existing
        ? {
            ...notification,
            readAt: existing.readAt ?? notification.readAt ?? null,
          }
        : notification,
    );
  });

  return Array.from(byId.values()).sort((a, b) => {
    const createdAtDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdAtDelta !== 0) return createdAtDelta;
    return b.id.localeCompare(a.id);
  });
}
