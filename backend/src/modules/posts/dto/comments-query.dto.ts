import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CommentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string; // ✅ FIX UTAMA
}
