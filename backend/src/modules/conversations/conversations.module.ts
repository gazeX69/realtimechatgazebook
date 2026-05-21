import { forwardRef, Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [SafetyModule, forwardRef(() => RealtimeModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
