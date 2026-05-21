import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
