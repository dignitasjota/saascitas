import { Controller, Get, Patch, Body } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async getCurrent(@CurrentUser() user: JwtPayload) {
    const data = await this.tenantsService.findById(user.tid);
    return { data };
  }

  @Patch()
  @Roles('owner', 'admin')
  async update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateTenantDto) {
    const data = await this.tenantsService.update(user.tid, dto);
    return { data };
  }
}
