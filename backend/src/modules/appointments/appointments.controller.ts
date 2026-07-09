import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/create-appointment.dto';
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
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.appointmentsService.findAll(user.tid, {
      from,
      to,
      employeeId,
      status,
      limit,
      cursor,
    });
  }

  @Get('calendar')
  async getCalendar(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
  ) {
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
    @Query('employeeId') employeeId?: string,
  ) {
    const data = await this.appointmentsService.getToday(user.tid, employeeId);
    return { data };
  }

  @Roles('owner', 'admin')
  @Get('export')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
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
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
    @Query('duration') duration: number,
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
    @Param('id') id: string,
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
    @Param('id') id: string,
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
    @Param('id') id: string,
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
