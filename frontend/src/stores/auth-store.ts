import { create } from 'zustand';
import { AxiosError } from 'axios';
import { apiClient, apiData, resetAuthSessionState } from '../lib/api-client';
import { authStorage } from '../lib/auth-storage';
import { disconnectSocket } from '../lib/socket-client';

export type User = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  allowGroupInvite?: 'friends_only' | 'nobody';
};

type AuthResponse = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

type AuthState = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; username: string; displayName: string; password: string }) => Promise<void>;
  hydrate: () => Promise<void>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  login: async (email, password) => {
    const data = await apiData<AuthResponse>(apiClient.post('/auth/login', { email, password }));
    authStorage.setTokens(data.accessToken, data.refreshToken);
    resetAuthSessionState();
    set({ user: data.user });
  },
  register: async (payload) => {
    const data = await apiData<AuthResponse>(apiClient.post('/auth/register', payload));
    authStorage.setTokens(data.accessToken, data.refreshToken);
    resetAuthSessionState();
    set({ user: data.user });
  },
  hydrate: async () => {
    if (!authStorage.getAccessToken() && !authStorage.getRefreshToken()) {
      set({ user: null, isLoading: false });
      return;
    }
    try {
      const user = await apiData<User>(apiClient.get('/me'));
      resetAuthSessionState();
      set({ user, isLoading: false });
    } catch (error) {
      if (error instanceof AxiosError && !error.response) {
        set({ user: null, isLoading: false });
        return;
      }
      authStorage.clear();
      disconnectSocket();
      set({ user: null, isLoading: false });
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    const refreshToken = authStorage.getRefreshToken();
    try {
      if (refreshToken && get().user) await apiClient.post('/auth/logout', { refreshToken });
    } finally {
      authStorage.clear();
      disconnectSocket();
      set({ user: null });
    }
  },
}));
