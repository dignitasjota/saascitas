import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  serviceId: string;

  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;   // "2026-03-15"

  @IsString()
  @IsNotEmpty()
  slot: string;   // "10:00"

  // Customer data
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
