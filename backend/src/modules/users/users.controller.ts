import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Profile (any authenticated user) ──────────────────────────────────────

  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    const data = await this.usersService.getProfile(user.tid, user.sub);
    return { data };
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const data = await this.usersService.updateProfile(user.tid, user.sub, dto);
    return { data };
  }

  @Post('me/change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.tid, user.sub, dto);
  }

  // ─── User management (owner + admin) ───────────────────────────────────────

  @Get()
  @Roles('owner', 'admin')
  async findAll(@CurrentUser() user: JwtPayload) {
    const data = await this.usersService.findAll(user.tid);
    return { data };
  }

  @Get(':id')
  @Roles('owner', 'admin')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.usersService.findOne(user.tid, id);
    return { data };
  }

  @Post()
  @Roles('owner')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUserDto,
  ) {
    const data = await this.usersService.create(user.tid, dto);
    return { data };
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const data = await this.usersService.update(
      user.tid,
      id,
      dto,
      user.sub,
      user.role,
    );
    return { data };
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.usersService.remove(user.tid, id, user.sub, user.role);
  }
}
