import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user.sub, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch('read-all')
  patchMarkAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.sub);
  }
}
