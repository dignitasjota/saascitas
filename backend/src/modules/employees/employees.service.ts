import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import {
  SetWorkingHoursDto,
  CreateScheduleExceptionDto,
} from './dto/working-hours.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.employee.findMany({
      where: { tenantId, deletedAt: null },
      include: { employeeServices: { select: { serviceId: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        workingHours: { where: { isActive: true }, orderBy: { dayOfWeek: 'asc' } },
        employeeServices: { include: { service: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async create(tenantId: string, dto: CreateEmployeeDto) {
    // Check plan limit
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const employeeCount = await this.prisma.employee.count({
      where: { tenantId, deletedAt: null },
    });

    if (tenant && employeeCount >= tenant.maxEmployees) {
      throw new BadRequestException(
        `Your plan allows a maximum of ${tenant.maxEmployees} employee(s). Upgrade to add more.`,
      );
    }

    // New employees offer every active service by default, so they are
    // bookable online straight away (the owner can narrow it down later).
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          color: dto.color,
          specialties: dto.specialties || [],
        },
      });

      const services = await tx.service.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (services.length > 0) {
        await tx.employeeService.createMany({
          data: services.map((s) => ({
            tenantId,
            employeeId: employee.id,
            serviceId: s.id,
          })),
          skipDuplicates: true,
        });
      }

      return employee;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    await this.findById(tenantId, id); // Verify exists + tenant

    return this.prisma.employee.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    return this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ========================================
  // Services offered
  // ========================================

  /**
   * Replace the set of services an employee offers. Public booking only
   * lists/accepts employees linked to the chosen service.
   */
  async setServices(tenantId: string, employeeId: string, serviceIds: string[]) {
    await this.findById(tenantId, employeeId);

    const uniqueIds = [...new Set(serviceIds)];
    if (uniqueIds.length > 0) {
      const count = await this.prisma.service.count({
        where: { id: { in: uniqueIds }, tenantId, deletedAt: null },
      });
      if (count !== uniqueIds.length) {
        throw new BadRequestException('One or more services were not found');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.employeeService.deleteMany({ where: { employeeId, tenantId } });
      if (uniqueIds.length > 0) {
        await tx.employeeService.createMany({
          data: uniqueIds.map((serviceId) => ({ tenantId, employeeId, serviceId })),
        });
      }
      return tx.employeeService.findMany({
        where: { employeeId, tenantId },
        select: { serviceId: true },
      });
    });
  }

  // ========================================
  // Working Hours
  // ========================================

  async getWorkingHours(tenantId: string, employeeId: string) {
    await this.findById(tenantId, employeeId);

    return this.prisma.workingHour.findMany({
      where: { employeeId, tenantId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setWorkingHours(
    tenantId: string,
    employeeId: string,
    dto: SetWorkingHoursDto,
  ) {
    await this.findById(tenantId, employeeId);

    // Validate: endTime > startTime for each entry
    for (const entry of dto.hours) {
      if (entry.endTime <= entry.startTime) {
        throw new BadRequestException(
          `End time (${entry.endTime}) must be after start time (${entry.startTime}) for ${entry.dayOfWeek}`,
        );
      }
    }

    // Replace all working hours in a transaction
    return this.prisma.$transaction(async (tx) => {
      // Delete existing
      await tx.workingHour.deleteMany({
        where: { employeeId, tenantId },
      });

      // Create new
      if (dto.hours.length > 0) {
        await tx.workingHour.createMany({
          data: dto.hours.map((h) => ({
            tenantId,
            employeeId,
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            isActive: h.isActive ?? true,
          })),
        });
      }

      return tx.workingHour.findMany({
        where: { employeeId, tenantId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }

  // ========================================
  // Schedule Exceptions
  // ========================================

  async getScheduleExceptions(
    tenantId: string,
    employeeId: string,
    fromDate?: string,
    toDate?: string,
  ) {
    await this.findById(tenantId, employeeId);

    const where: any = { employeeId, tenantId };

    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    return this.prisma.scheduleException.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async createScheduleException(
    tenantId: string,
    employeeId: string,
    dto: CreateScheduleExceptionDto,
  ) {
    await this.findById(tenantId, employeeId);

    if (dto.isAvailable && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException(
        'Start time and end time are required when marking a day as available with special hours',
      );
    }

    return this.prisma.scheduleException.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: new Date(dto.date),
        },
      },
      update: {
        isAvailable: dto.isAvailable,
        startTime: dto.startTime,
        endTime: dto.endTime,
        reason: dto.reason,
      },
      create: {
        tenantId,
        employeeId,
        date: new Date(dto.date),
        isAvailable: dto.isAvailable,
        startTime: dto.startTime,
        endTime: dto.endTime,
        reason: dto.reason,
      },
    });
  }

  async deleteScheduleException(
    tenantId: string,
    employeeId: string,
    exceptionId: string,
  ) {
    const exception = await this.prisma.scheduleException.findFirst({
      where: { id: exceptionId, employeeId, tenantId },
    });

    if (!exception) {
      throw new NotFoundException('Schedule exception not found');
    }

    return this.prisma.scheduleException.delete({
      where: { id: exceptionId },
    });
  }
}
