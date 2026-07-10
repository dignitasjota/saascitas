import { IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/strong-password.decorator';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @IsStrongPassword()
  @MaxLength(100)
  newPassword: string;
}
