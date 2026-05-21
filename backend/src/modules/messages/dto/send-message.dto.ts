import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class StoryReferenceDto {
  @IsUUID("4")
  storyId: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUUID("4", { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientMessageId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoryReferenceDto)
  storyReference?: StoryReferenceDto;
}
