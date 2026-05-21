import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConversationsModule } from '../conversations/conversations.module';
import { SafetyModule } from '../safety/safety.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'realtime-events' }), JwtModule.register({}), forwardRef(() => ConversationsModule), SafetyModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
