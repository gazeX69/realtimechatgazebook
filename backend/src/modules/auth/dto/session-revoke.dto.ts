import { IsUUID } from 'class-validator';

export class SessionRevokeDto {
  @IsUUID()
  sessionId: string;
}
