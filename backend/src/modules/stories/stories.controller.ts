import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateStoryDto } from "./dto/create-story.dto";
import { ReactStoryDto } from "./dto/react-story.dto";
import { StoriesService } from "./stories.service";

@UseGuards(JwtAuthGuard)
@Controller("stories")
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateStoryDto) {
    return this.stories.create(user.sub, dto);
  }

  @Get("feed")
  feed(@CurrentUser() user: CurrentUserPayload) {
    return this.stories.feed(user.sub);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUserPayload, @Param("id") storyId: string) {
    return this.stories.get(user.sub, storyId);
  }

  @Post(":id/seen")
  seen(@CurrentUser() user: CurrentUserPayload, @Param("id") storyId: string) {
    return this.stories.seen(user.sub, storyId);
  }

  @Post(":id/reactions")
  react(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") storyId: string,
    @Body() dto: ReactStoryDto,
  ) {
    return this.stories.react(user.sub, storyId, dto);
  }

  @Delete(":id")
  delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") storyId: string,
  ) {
    return this.stories.delete(user.sub, storyId);
  }
}
