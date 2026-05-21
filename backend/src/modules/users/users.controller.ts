import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.users.me(user.sub);
  }

  @Put('me/profile')
  updateProfile(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Get('users')
  listUsers(@CurrentUser() user: CurrentUserPayload) {
    return this.users.listUsers(user.sub);
  }

  @Get('users/search')
  searchUsers(@CurrentUser() user: CurrentUserPayload, @Query('q') query = '') {
    return this.users.searchUsers(user.sub, query);
  }

  @Get('users/suggested')
  suggestedUsers(@CurrentUser() user: CurrentUserPayload) {
    return this.users.suggestedUsers(user.sub);
  }
}
