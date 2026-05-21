import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SessionRevokeDto } from './dto/session-revoke.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: CurrentUserPayload, @Body() dto: RefreshTokenDto) {
    return this.auth.logout(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  sessions(@CurrentUser() user: CurrentUserPayload, @Body() dto: RefreshTokenDto) {
    return this.auth.listSessions(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke')
  revokeSession(@CurrentUser() user: CurrentUserPayload, @Body() dto: SessionRevokeDto) {
    return this.auth.revokeSession(user.sub, dto.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke-others')
  revokeOtherSessions(@CurrentUser() user: CurrentUserPayload, @Body() dto: RefreshTokenDto) {
    return this.auth.revokeOtherSessions(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto);
  }
}
