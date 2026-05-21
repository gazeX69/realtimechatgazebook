import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ListMessagesDto } from "./dto/list-messages.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";

@UseGuards(JwtAuthGuard)
@Controller("conversations/:conversationId/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Param("conversationId") conversationId: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.messages.listMessages(user.sub, conversationId, query);
  }

  @Post()
  send(
    @CurrentUser() user: CurrentUserPayload,
    @Param("conversationId") conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendMessage(user.sub, conversationId, dto);
  }

  @Delete(":messageId")
  delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messages.deleteMessageForEveryone(
      user.sub,
      conversationId,
      messageId,
    );
  }
}
