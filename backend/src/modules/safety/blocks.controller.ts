import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BlockPolicyService } from './block-policy.service';
import { BlockUserDto } from './dto/block-user.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlockPolicyService) {}

  @Post('users/:id/block')
  block(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: BlockUserDto) {
    return this.blocks.blockUser(user.sub, id, dto.reason);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.blocks.unblockUser(user.sub, id);
  }

  @Get('blocks')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.blocks.listBlocks(user.sub);
  }
}
