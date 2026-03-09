import { Controller, Get, Query, Request } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Roles } from '../../common/decorators/roles.decorator';

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
      days ? parseInt(days, 10) : 30,
    );
    return { data };
  }

  @Get('appointments')
  async getAppointments(@Request() req: any, @Query('days') days?: string) {
    const tenantId = req.user.tid;
    const data = await this.metricsService.getAppointmentsChart(
      tenantId,
      days ? parseInt(days, 10) : 30,
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
