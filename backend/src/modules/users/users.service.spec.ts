import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  verify: jest.fn().mockResolvedValue(true),
}));

const DTO = {
  email: 'Pepe@Example.com',
  password: 'Secret123',
  firstName: 'Pepe',
  lastName: 'Pérez',
  role: 'technician',
} as any;

function setup() {
  const prisma: any = {
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: { findFirst: jest.fn(), updateMany: jest.fn() },
    employee: { findFirst: jest.fn() },
  };
  return { prisma, service: new UsersService(prisma) };
}

describe('UsersService.create', () => {
  it('checks email uniqueness across ALL tenants (login is global)', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'other-tenant-user' });

    await expect(service.create('tenant-1', DTO)).rejects.toThrow(ConflictException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'pepe@example.com', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('maps a unique-index race (P2002) to 409 instead of 500', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create('tenant-1', DTO)).rejects.toThrow(ConflictException);
  });

  it('creates the user with a lowercased email', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1' });

    await service.create('tenant-1', DTO);
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe('pepe@example.com');
  });
});

describe('UsersService.changePassword', () => {
  const dto = { currentPassword: 'Old12345', newPassword: 'New12345' } as any;

  it('revokes every other session but keeps the current one', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: 'h' });
    prisma.refreshToken.findFirst.mockResolvedValue({ familyId: 'fam-current' });

    await service.changePassword('t1', 'u1', dto, 'raw-refresh');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, familyId: { not: 'fam-current' } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes all sessions when the current one is unknown', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: 'h' });

    await service.changePassword('t1', 'u1', dto);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
