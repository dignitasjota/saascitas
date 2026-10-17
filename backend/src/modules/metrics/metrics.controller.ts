import { BadRequestException, Controller, Get, Query, Request } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Roles } from '../../common/decorators/roles.decorator';

/** `days` query param: 1–366, default 30 (it sizes an in-memory day map). */
function parseDays(days?: string): number {
  if (days === undefined || days === '') return 30;
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 366) {
    throw new BadRequestException('days must be an integer between 1 and 366');
  }
  return n;
}

@Controller('metrics')
@Roles('owner', 'admin')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  async getOverview(@Request() req: any) {
    const tenantId = req.user.tid;
    const data = await this.metricsService.getOverview(tenantId);
    return { data };
  }

  @Get('revenue')
  async getRevenue(@Request() req: any, @Query('days') days?: string) {
    const tenantId = req.user.tid;
    const data = await this.metricsService.getRevenueChart(
      tenantId,
      parseDays(days),
    );
    return { data };
  }

  @Get('appointments')
  async getAppointments(@Request() req: any, @Query('days') days?: string) {
    const tenantId = req.user.tid;
    const data = await this.metricsService.getAppointmentsChart(
      tenantId,
      parseDays(days),
    );
    return { data };
  }

  @Get('monthly')
  async getMonthly(@Request() req: any) {
    const tenantId = req.user.tid;
    const data = await this.metricsService.getMonthlyBreakdown(tenantId);
    return { data };
  }
}
