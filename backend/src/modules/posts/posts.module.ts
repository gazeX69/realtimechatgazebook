import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { MediaModule } from '../media/media.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [RealtimeModule, NotificationsModule, SafetyModule, MediaModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
