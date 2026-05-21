import { Module } from '@nestjs/common';
import { BlocksController } from './blocks.controller';
import { BlockPolicyService } from './block-policy.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  controllers: [BlocksController],
  providers: [BlockPolicyService, RateLimitService],
  exports: [BlockPolicyService, RateLimitService],
})
export class SafetyModule {}
