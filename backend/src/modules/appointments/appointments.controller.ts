import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import {
  AvailabilityQueryDto,
  CalendarQueryDto,
  CreateAppointmentDto,
  ExportQueryDto,
  ListAppointmentsQueryDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/create-appointment.dto';

// The calendar endpoint is open to every staff role and returns customer
// phones, so its window is bounded (bulk access goes through the export).
const MAX_CALENDAR_RANGE_MS = 93 * 24 * 60 * 60 * 1000;
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

// All staff roles may view and manage appointments; bulk CSV export is
// restricted to owners/admins (see per-method override below).
@Roles('owner', 'admin', 'technician')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.findAll(user.tid, query);
  }

  @Get('calendar')
  async getCalendar(
    @CurrentUser() user: JwtPayload,
    @Query() { from, to, employeeId }: CalendarQueryDto,
  ) {
    const span = new Date(to).getTime() - new Date(from).getTime();
    if (span < 0 || span > MAX_CALENDAR_RANGE_MS) {
      throw new BadRequestException(
        '"to" must be after "from" and the range at most 93 days',
      );
    }
    const data = await this.appointmentsService.getCalendar(
      user.tid,
      from,
      to,
      employeeId,
    );
    return { data };
  }

  @Get('today')
  async getToday(
    @CurrentUser() user: JwtPayload,
    @Query('employeeId', new ParseUUIDPipe({ optional: true })) employeeId?: string,
  ) {
    const data = await this.appointmentsService.getToday(user.tid, employeeId);
    return { data };
  }

  @Roles('owner', 'admin')
  @Get('export')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() { from, to }: ExportQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.appointmentsService.exportCsv(user.tid, from, to);
    const filename = `citas_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8 detection
  }

  @Get('availability')
  async getAvailability(
    @CurrentUser() user: JwtPayload,
    @Query() { employeeId, date, duration }: AvailabilityQueryDto,
  ) {
    const slots = await this.availabilityService.getAvailableSlots(
      user.tid,
      employeeId,
      date,
      duration || 60,
    );
    return { data: slots };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const appointment = await this.appointmentsService.findById(user.tid, id);
    return { data: appointment };
  }

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.create(user.tid, dto);
    return { data: appointment };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.update(
      user.tid,
      id,
      dto,
    );
    return { data: appointment };
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const appointment = await this.appointmentsService.updateStatus(
      user.tid,
      id,
      dto,
    );
    return { data: appointment };
  }
}
