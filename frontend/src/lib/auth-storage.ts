const ACCESS_TOKEN_KEY = 'realtime.accessToken';
const REFRESH_TOKEN_KEY = 'realtime.refreshToken';

export const authStorage = {
  getAccessToken: () => {
    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (sessionToken) return sessionToken;

    const legacyToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (legacyToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, legacyToken);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    return legacyToken;
  },
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken: string, refreshToken: string) => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  setAccessToken: (accessToken: string) => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  },
  clear: () => {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
