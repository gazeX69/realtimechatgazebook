import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { SafetyModule } from '../safety/safety.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SafetyModule, FriendsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
