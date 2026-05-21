import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
