import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  employeeId: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  employee: { select: { id: true, firstName: true, lastName: true } },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
    return users;
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(tenantId: string, dto: CreateUserDto) {
    // Emails identify the account at login across all tenants, so they must
    // be unique platform-wide (not just within this tenant).
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already in use');

    // Cannot create another owner
    if (dto.role === 'owner') {
      throw new BadRequestException('Cannot create another owner user');
    }

    // Validate employeeId belongs to tenant
    if (dto.employeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId, deletedAt: null },
      });
      if (!emp) throw new NotFoundException('Employee not found');
    }

    const passwordHash = await hash(dto.password, ARGON2_OPTIONS);

    try {
      return await this.prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          employeeId: dto.employeeId ?? null,
        },
        select: USER_SELECT,
      });
    } catch (err) {
      // Lost a race against a concurrent signup/creation with the same email.
      if (isUniqueViolation(err)) throw new ConflictException('Email already in use');
      throw err;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto, requesterId: string, requesterRole: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    // Only owner can change roles or edit other users
    if (id !== requesterId && requesterRole !== 'owner') {
      throw new ForbiddenException('Only owner can edit other users');
    }

    // Cannot demote the owner
    if (user.role === 'owner' && dto.role && dto.role !== 'owner') {
      throw new ForbiddenException('Cannot change the role of the owner');
    }

    // Cannot promote to owner
    if (dto.role === 'owner' && user.role !== 'owner') {
      throw new BadRequestException('Cannot promote a user to owner');
    }

    // Validate employeeId
    if (dto.employeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId, deletedAt: null },
      });
      if (!emp) throw new NotFoundException('Employee not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        employeeId: dto.employeeId !== undefined ? dto.employeeId : undefined,
      },
      select: USER_SELECT,
    });

    return updated;
  }

  async getProfile(tenantId: string, id: string) {
    return this.findOne(tenantId, id);
  }

  async updateProfile(tenantId: string, id: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      select: USER_SELECT,
    });
  }

  async changePassword(tenantId: string, id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const valid = await verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException('La contraseña actual es incorrecta');

    const newHash = await hash(dto.newPassword, ARGON2_OPTIONS);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: newHash },
    });
  }

  async remove(tenantId: string, id: string, requesterId: string, requesterRole: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    // Cannot delete yourself
    if (id === requesterId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    // Only owner can delete users
    if (requesterRole !== 'owner') {
      throw new ForbiddenException('Only owner can delete users');
    }

    // Cannot delete the owner
    if (user.role === 'owner') {
      throw new ForbiddenException('Cannot delete the owner account');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
