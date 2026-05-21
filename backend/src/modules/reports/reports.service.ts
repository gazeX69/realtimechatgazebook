import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportTargetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReportDto, ReportTargetInput } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    const reason = dto.reason.trim();
    const description = dto.description?.trim() || null;
    if (!reason) throw new BadRequestException('Reason is required');

    const targetType = this.toReportTargetType(dto.targetType);
    await this.assertTargetIsReportable(reporterId, dto.targetType, dto.targetId);

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType,
        targetId: dto.targetId,
        reason,
        description,
      },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    return { message: 'Report submitted', data: report };
  }

  private async assertTargetIsReportable(reporterId: string, targetType: ReportTargetInput, targetId: string) {
    if (targetType === 'user') {
      if (reporterId === targetId) throw new BadRequestException('Cannot report yourself');
      const user = await this.prisma.user.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
      if (!user) throw new NotFoundException('Report target not found');
      return;
    }

    if (targetType === 'post') {
      const post = await this.prisma.post.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
      if (!post) throw new NotFoundException('Report target not found');
      return;
    }

    if (targetType === 'comment') {
      const comment = await this.prisma.postComment.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
      if (!comment) throw new NotFoundException('Report target not found');
      return;
    }

    const message = await this.prisma.message.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
    if (!message) throw new NotFoundException('Report target not found');
  }

  private toReportTargetType(targetType: ReportTargetInput) {
    const map: Record<ReportTargetInput, ReportTargetType> = {
      user: ReportTargetType.USER,
      post: ReportTargetType.POST,
      comment: ReportTargetType.COMMENT,
      message: ReportTargetType.MESSAGE,
    };
    return map[targetType];
  }
}
