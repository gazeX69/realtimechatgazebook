import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUserPayload = {
  sub: string;
  email: string;
  username: string;
  sessionId?: string;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => ctx.switchToHttp().getRequest().user,
);
