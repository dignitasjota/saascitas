import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/create-service.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    const services = await this.servicesService.findAll(user.tid);
    return { data: services };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const service = await this.servicesService.findById(user.tid, id);
    return { data: service };
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateServiceDto,
  ) {
    const service = await this.servicesService.create(user.tid, dto);
    return { data: service };
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const service = await this.servicesService.update(user.tid, id, dto);
    return { data: service };
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.servicesService.remove(user.tid, id);
    return { data: { message: 'Service deactivated' } };
  }
}
