import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import {
  SetWorkingHoursDto,
  CreateScheduleExceptionDto,
  SetEmployeeServicesDto,
  ExceptionsQueryDto,
} from './dto/working-hours.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    const employees = await this.employeesService.findAll(user.tid);
    return { data: employees };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const employee = await this.employeesService.findById(user.tid, id);
    return { data: employee };
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeDto,
  ) {
    const employee = await this.employeesService.create(user.tid, dto);
    return { data: employee };
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const employee = await this.employeesService.update(user.tid, id, dto);
    return { data: employee };
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.employeesService.remove(user.tid, id);
    return { data: { message: 'Employee deactivated' } };
  }

  // ========================================
  // Services offered
  // ========================================

  @Put(':id/services')
  @Roles(UserRole.owner, UserRole.admin)
  async setServices(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEmployeeServicesDto,
  ) {
    const data = await this.employeesService.setServices(user.tid, id, dto.serviceIds);
    return { data };
  }

  // ========================================
  // Working Hours
  // ========================================

  @Get(':id/schedule')
  async getSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const hours = await this.employeesService.getWorkingHours(user.tid, id);
    return { data: hours };
  }

  @Patch(':id/schedule')
  @Roles(UserRole.owner, UserRole.admin)
  async setSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetWorkingHoursDto,
  ) {
    const hours = await this.employeesService.setWorkingHours(
      user.tid,
      id,
      dto,
    );
    return { data: hours };
  }

  // ========================================
  // Schedule Exceptions
  // ========================================

  @Get(':id/exceptions')
  async getExceptions(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() { from, to }: ExceptionsQueryDto,
  ) {
    const exceptions = await this.employeesService.getScheduleExceptions(
      user.tid,
      id,
      from,
      to,
    );
    return { data: exceptions };
  }

  @Post(':id/exceptions')
  @Roles(UserRole.owner, UserRole.admin)
  async createException(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScheduleExceptionDto,
  ) {
    const exception = await this.employeesService.createScheduleException(
      user.tid,
      id,
      dto,
    );
    return { data: exception };
  }

  @Delete(':id/exceptions/:exceptionId')
  @Roles(UserRole.owner, UserRole.admin)
  async deleteException(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ) {
    await this.employeesService.deleteScheduleException(
      user.tid,
      id,
      exceptionId,
    );
    return { data: { message: 'Exception removed' } };
  }
}
