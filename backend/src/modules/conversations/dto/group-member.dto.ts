import { IsUUID } from 'class-validator';

export class GroupMemberDto {
  @IsUUID()
  userId: string;
}
