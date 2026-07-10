import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/strong-password.decorator';

export class RegisterDto {
  // Company
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  companyName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  // User (owner)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsStrongPassword()
  @MaxLength(128)
  password: string;
}
