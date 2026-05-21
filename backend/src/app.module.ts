import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import appConfig from "./config/app.config";
import jwtConfig from "./config/jwt.config";
import redisConfig from "./config/redis.config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { HealthModule } from "./modules/health/health.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { PostsModule } from "./modules/posts/posts.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { FollowsModule } from "./modules/follows/follows.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { SafetyModule } from "./modules/safety/safety.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { FriendsModule } from "./modules/friends/friends.module";
import { MediaModule } from "./modules/media/media.module";
import { StoriesModule } from "./modules/stories/stories.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, redisConfig],
      envFilePath: [".env"],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>("redis.host"),
          port: config.getOrThrow<number>("redis.port"),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    RealtimeModule,
    NotificationsModule,
    SafetyModule,
    ReportsModule,
    FriendsModule,
    FollowsModule,
    UploadsModule,
    MediaModule,
    PostsModule,
    StoriesModule,
    HealthModule,
  ],
})
export class AppModule {}
