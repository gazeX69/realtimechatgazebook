import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FriendsService } from './friends.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Post('friends/:id/request')
  request(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.friends.requestFriend(user.sub, id);
  }

  @Post('friend-requests/:id/accept')
  accept(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.friends.acceptRequest(user.sub, id);
  }

  @Post('friend-requests/:id/reject')
  reject(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.friends.rejectRequest(user.sub, id);
  }

  @Post('friend-requests/:id/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.friends.cancelRequest(user.sub, id);
  }

  @Delete('friends/:id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.friends.removeFriend(user.sub, id);
  }

  @Get('friends')
  listFriends(@CurrentUser() user: CurrentUserPayload) {
    return this.friends.listFriends(user.sub);
  }

  @Get('friend-requests')
  listRequests(@CurrentUser() user: CurrentUserPayload) {
    return this.friends.listRequests(user.sub);
  }
}
