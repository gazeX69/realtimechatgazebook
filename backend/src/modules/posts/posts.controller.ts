import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommentsQueryDto } from './dto/comments-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { ExploreQueryDto } from './dto/explore-query.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { PostsService } from './posts.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  createPost(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.createPost(user.sub, dto);
  }

  @Get('feed')
  getFeed(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FeedQueryDto,
  ) {
    return this.posts.getFeed(user.sub, query);
  }

  @Get('explore')
  explore(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ExploreQueryDto,
  ) {
    return this.posts.explore(user.sub, query);
  }

  @Post('posts/:id/react')
  react(@CurrentUser() user: CurrentUserPayload, @Param('id') postId: string) {
    return this.posts.react(user.sub, postId);
  }

  @Delete('posts/:id/react')
  unreact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') postId: string,
  ) {
    return this.posts.unreact(user.sub, postId);
  }

  @Post('posts/:id/comments')
  createComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.createComment(user.sub, postId, dto);
  }

  @Get('posts/:id/comments')
  getComments(@Param('id') postId: string, @Query() query: CommentsQueryDto) {
    return this.posts.getComments(postId, query);
  }
}
