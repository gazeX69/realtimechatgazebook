import { ArrayMinSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateGroupConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  memberIds: string[];
}
