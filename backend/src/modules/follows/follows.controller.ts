import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FollowsService } from './follows.service';

@UseGuards(JwtAuthGuard)
@Controller('users/:id')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get('profile')
  profile(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.follows.profile(user.sub, id);
  }

  @Post('follow')
  follow(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.follows.follow(user.sub, id);
  }

  @Delete('follow')
  unfollow(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.follows.unfollow(user.sub, id);
  }

  @Get('followers')
  followers(@Param('id') id: string) {
    return this.follows.followers(id);
  }

  @Get('following')
  following(@Param('id') id: string) {
    return this.follows.following(id);
  }
}
