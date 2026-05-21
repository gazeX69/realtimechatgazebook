import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { GroupMemberDto } from './dto/group-member.dto';
import { RenameGroupConversationDto } from './dto/rename-group-conversation.dto';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('direct')
  createDirect(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateDirectConversationDto) {
    return this.conversations.createOrFindDirectConversation(user.sub, dto.participantId);
  }

  @Post('group')
  createGroup(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGroupConversationDto) {
    return this.conversations.createGroupConversation(user.sub, dto);
  }

  @Patch('group/:id')
  renameGroup(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string, @Body() dto: RenameGroupConversationDto) {
    return this.conversations.renameGroupConversation(user.sub, conversationId, dto);
  }

  @Post('group/:id/members')
  addGroupMember(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string, @Body() dto: GroupMemberDto) {
    return this.conversations.addGroupMember(user.sub, conversationId, dto.userId);
  }

  @Delete('group/:id/members/:userId')
  removeGroupMember(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string, @Param('userId') userId: string) {
    return this.conversations.removeGroupMember(user.sub, conversationId, userId);
  }

  @Post('group/:id/owner')
  transferGroupOwner(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string, @Body() dto: GroupMemberDto) {
    return this.conversations.transferGroupOwner(user.sub, conversationId, dto.userId);
  }

  @Post('group/:id/leave')
  leaveGroup(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string) {
    return this.conversations.leaveGroup(user.sub, conversationId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.conversations.listConversations(user.sub);
  }

  @Post(':id/read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload, @Param('id') conversationId: string) {
    return this.conversations.markAllRead(conversationId, user.sub);
  }
}
