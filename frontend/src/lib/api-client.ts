import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authStorage } from './auth-storage';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `${API_ORIGIN.replace(/\/$/, '')}/api`;

export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === 'function') config.headers.delete('Content-Type');
    const headers = config.headers as unknown as Record<string, unknown>;
    delete headers['Content-Type'];
    delete headers['content-type'];
  }
  return config;
});

const SESSION_EXPIRED_REASON_KEY = 'realtime.sessionExpiredReason';
let refreshPromise: Promise<string | null> | null = null;
let authExpiredNotified = false;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._retry) throw error;

    original._retry = true;
    const newToken = await refreshAccessTokenOnce();
    if (!newToken) {
      notifyAuthExpired('refresh_failed');
      throw error;
    }

    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient(original);
  },
);

export function refreshAccessTokenOnce() {
  refreshPromise ??= performRefreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export const refreshAccessToken = refreshAccessTokenOnce;

export function resetAuthSessionState() {
  authExpiredNotified = false;
  sessionStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
}

async function performRefreshAccessToken() {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) {
    console.warn('[auth] refresh skipped: no refresh token');
    return null;
  }

  try {
    console.info('[auth] refreshing access token');
    const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken?: string }>>(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      { withCredentials: true, headers: { 'ngrok-skip-browser-warning': 'true' } },
    );
    if (response.data.data.refreshToken) authStorage.setTokens(response.data.data.accessToken, response.data.data.refreshToken);
    else authStorage.setAccessToken(response.data.data.accessToken);
    resetAuthSessionState();
    return response.data.data.accessToken;
  } catch {
    console.warn('[auth] refresh token rejected');
    authStorage.clear();
    return null;
  }
}

export function notifyAuthExpired(reason: string) {
  if (authExpiredNotified) return;
  authExpiredNotified = true;
  console.warn(`[auth] session expired: ${reason}`);
  sessionStorage.setItem(SESSION_EXPIRED_REASON_KEY, reason);
  authStorage.clear();
  window.dispatchEvent(new CustomEvent('auth:expired', { detail: { reason } }));
}

export async function apiData<T>(request: Promise<{ data: ApiEnvelope<T> }>) {
  const response = await request;
  return response.data.data;
}

export async function apiEnvelope<T>(request: Promise<{ data: ApiEnvelope<T> }>) {
  const response = await request;
  return response.data;
}
