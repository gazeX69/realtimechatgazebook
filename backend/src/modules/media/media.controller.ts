import { Controller, Get, HttpCode, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MediaService } from './media.service';

type UploadedMediaFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService, private readonly config: ConfigService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@CurrentUser() user: CurrentUserPayload, @UploadedFile() file: UploadedMediaFile | undefined, @Req() request: Request) {
    const asset = await this.media.upload(user.sub, file);
    return {
      ...asset,
      publicUrl: `${this.publicBaseUrl(request)}/uploads/${asset.storageKey}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async stream(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Res() response: Response) {
    const { asset, stream } = await this.media.getAuthorizedMedia(user.sub, id);
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', String(asset.size));
    response.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', () => {
      if (!response.headersSent) response.sendStatus(404);
      else response.end();
    });
    stream.pipe(response);
  }

  private publicBaseUrl(request: Request) {
    const configured = this.config.get<string>('app.appUrl', 'http://localhost:3000').replace(/\/$/, '');
    if (!configured.includes('localhost') && !configured.includes('127.0.0.1')) return configured;

    const forwardedProto = request.headers['x-forwarded-proto'];
    const forwardedHost = request.headers['x-forwarded-host'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    return `${proto ?? request.protocol}://${host ?? request.get('host')}`;
  }
}
