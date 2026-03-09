import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/booking.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Public()
@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get(':slug')
  async getBusinessInfo(@Param('slug') slug: string) {
    const data = await this.bookingService.getBusinessInfo(slug);
    return { data };
  }

  @Get(':slug/services')
  async getServices(@Param('slug') slug: string) {
    const data = await this.bookingService.getPublicServices(slug);
    return { data };
  }

  @Get(':slug/employees')
  async getEmployees(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId?: string,
  ) {
    const data = await this.bookingService.getPublicEmployees(slug, serviceId);
    return { data };
  }

  @Get(':slug/slots')
  async getSlots(
    @Param('slug') slug: string,
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
  ) {
    const data = await this.bookingService.getAvailableSlots(
      slug,
      employeeId,
      date,
      serviceId,
    );
    return { data };
  }

  @Post(':slug/book')
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // 5 bookings/min per IP
  async createBooking(
    @Param('slug') slug: string,
    @Body() dto: CreateBookingDto,
  ) {
    const data = await this.bookingService.createBooking(slug, dto);
    return { data };
  }

  @Post('confirm/:token')
  @HttpCode(HttpStatus.OK)
  async confirmBooking(@Param('token') token: string) {
    const data = await this.bookingService.confirmBooking(token);
    return { data };
  }

  @Post('cancel/:token')
  @HttpCode(HttpStatus.OK)
  async cancelBooking(
    @Param('token') token: string,
    @Body('reason') reason?: string,
  ) {
    const data = await this.bookingService.cancelBooking(token, reason);
    return { data };
  }
}
