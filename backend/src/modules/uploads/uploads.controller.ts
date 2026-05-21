import { BadRequestException, Controller, Get, HttpCode, Param, Post, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

type UploadedPostMedia = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'post-media');
const AVATAR_UPLOAD_DIR = join(process.cwd(), 'uploads', 'avatars');

@Controller('uploads')
export class UploadsController {
  constructor(private readonly config: ConfigService) {}

  @UseGuards(JwtAuthGuard)
  @Post('post-media')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('files', 4))
  async upload(@UploadedFiles() files: UploadedPostMedia[] = [], @Req() request: Request) {
    if (files.length === 0) throw new BadRequestException('At least one file is required');
    if (files.length > 4) throw new BadRequestException('Maximum 4 media files allowed');

    await mkdir(UPLOAD_DIR, { recursive: true });
    const uploaded = [];
    for (const [index, file] of files.entries()) {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException('Only jpeg, png, and webp images are allowed');
      if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Maximum file size is 5MB');

      const filename = `${randomUUID()}${extname(file.originalname) || this.extensionFor(file.mimetype)}`;
      await writeFile(join(UPLOAD_DIR, filename), file.buffer);
      const publicUrl = `${this.publicBaseUrl(request)}/uploads/post-media/${filename}`;
      uploaded.push({
        url: publicUrl,
        fileUrl: publicUrl,
        publicUrl,
        filename,
        mimeType: file.mimetype,
        size: file.size,
        orderIndex: index,
      });
    }
    return uploaded;
  }

  @Get('post-media/:filename')
  redirectLegacyMedia(@Param('filename') filename: string, @Res() response: Response) {
    return response.redirect(301, `/uploads/post-media/${filename}`);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@UploadedFile() file: UploadedPostMedia | undefined, @Req() request: Request) {
    if (!file) throw new BadRequestException('Avatar image is required');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException('Only jpeg, png, and webp images are allowed');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Maximum file size is 5MB');

    await mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}${extname(file.originalname) || this.extensionFor(file.mimetype)}`;
    await writeFile(join(AVATAR_UPLOAD_DIR, filename), file.buffer);
    const publicUrl = `${this.publicBaseUrl(request)}/uploads/avatars/${filename}`;
    return { url: publicUrl, avatarUrl: publicUrl, filename, mimeType: file.mimetype, size: file.size };
  }

  private extensionFor(mimeType: string) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
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
