import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ExploreQueryDto {
  @IsOptional()
  @IsIn(['newest', 'popular'])
  sort: 'newest' | 'popular' = 'newest';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 20;
}
