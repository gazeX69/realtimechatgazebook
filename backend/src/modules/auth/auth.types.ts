export type JwtPayload = {
  sub: string;
  email: string;
  username: string;
  sessionId?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
