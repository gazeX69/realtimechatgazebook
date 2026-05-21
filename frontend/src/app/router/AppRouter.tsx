import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { RegisterPage } from '../../features/auth/RegisterPage';
import { ChatListPage } from '../../features/chat/ChatListPage';
import { ChatRoomPage } from '../../features/chat/ChatRoomPage';
import { FeedPage } from '../../features/feed/FeedPage';
import { ExplorePage } from '../../features/feed/ExplorePage';
import { FriendRequestsPage } from '../../features/friends/FriendRequestsPage';
import { NotificationPage } from '../../features/notifications/NotificationPage';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { PublicProfilePage } from '../../features/users/PublicProfilePage';
import { useAuthStore } from '../../stores/auth-store';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/chat" element={<ChatListPage />} />
            <Route path="/chat/:conversationId" element={<ChatRoomPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/friends" element={<FriendRequestsPage />} />
            <Route path="/notifications" element={<NotificationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users/:userId" element={<PublicProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
