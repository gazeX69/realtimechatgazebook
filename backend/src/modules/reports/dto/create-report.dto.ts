import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export type ReportTargetInput = 'user' | 'post' | 'comment' | 'message';

export class CreateReportDto {
  @IsIn(['user', 'post', 'comment', 'message'])
  targetType!: ReportTargetInput;

  @IsUUID()
  targetId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
