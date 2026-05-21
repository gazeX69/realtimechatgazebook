import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  imports: [NotificationsModule, SafetyModule, FriendsModule, RealtimeModule],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
