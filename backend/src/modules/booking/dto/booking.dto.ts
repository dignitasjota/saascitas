import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  serviceId: string;

  @IsUUID()
  employeeId: string;

  // A civil date, not a full ISO timestamp: "2026-03-15T10:00Z" would pass
  // @IsDateString but breaks the wall-clock → UTC conversion (NaN dates).
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;   // "2026-03-15"

  @Matches(/^\d{2}:\d{2}$/, { message: 'slot must be in HH:MM format' })
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

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PublicEmployeesQueryDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;
}

export class PublicSlotsQueryDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  serviceId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;
}
