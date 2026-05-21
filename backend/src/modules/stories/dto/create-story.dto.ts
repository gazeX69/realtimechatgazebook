import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { StoryVisibility } from "@prisma/client";

const CREATE_STORY_VISIBILITIES = [
  StoryVisibility.FOLLOWERS,
  StoryVisibility.FRIENDS,
  StoryVisibility.PRIVATE,
] as const;

export class CreateStoryItemDto {
  @IsUUID("4")
  mediaAssetId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class CreateStoryDto {
  @IsOptional()
  @IsUUID("4")
  mediaAssetId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateStoryItemDto)
  items?: CreateStoryItemDto[];

  @IsOptional()
  @IsIn(CREATE_STORY_VISIBILITIES)
  visibility?: StoryVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}
