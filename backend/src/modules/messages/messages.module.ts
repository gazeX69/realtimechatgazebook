import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SafetyModule } from "../safety/safety.module";
import { MediaModule } from "../media/media.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [
    ConversationsModule,
    RealtimeModule,
    SafetyModule,
    MediaModule,
    NotificationsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
