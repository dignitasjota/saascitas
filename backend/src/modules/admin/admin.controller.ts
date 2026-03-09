import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateTenantPlanDto } from './dto/update-tenant-plan.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('admin')
@Roles('superadmin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    const data = await this.adminService.getStats();
    return { data };
  }

  @Get('tenants')
  async listTenants(
    @Query('search') search?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.adminService.listTenants({ search, plan, status, limit, cursor });
  }

  @Get('tenants/:id')
  async getTenant(@Param('id') id: string) {
    const data = await this.adminService.getTenant(id);
    return { data };
  }

  @Patch('tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantPlanDto,
  ) {
    const data = await this.adminService.updateTenant(id, dto);
    return { data };
  }

  @Post('tenants/:id/suspend')
  async suspendTenant(@Param('id') id: string) {
    const data = await this.adminService.suspendTenant(id);
    return { data };
  }
}
