import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.sessionId) {
      const session = await this.prisma.refreshToken.findFirst({
        where: { id: payload.sessionId, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!session) throw new UnauthorizedException('Session revoked');
    }
    return payload;
  }
}
