import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('JwtStrategy.validate (DB re-validation)', () => {
  let strategy: JwtStrategy;
  const findUnique = jest.fn();

  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const prisma = { user: { findUnique } } as unknown as PrismaService;

  const payload = { sub: 'user-1', tid: 'tenant-1', role: 'owner' };

  const activeUser = {
    id: 'user-1',
    role: 'owner',
    tenantId: 'tenant-1',
    deletedAt: null,
    lockedUntil: null,
    tenant: { deletedAt: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(config, prisma);
  });

  it('returns the payload for an active user', async () => {
    findUnique.mockResolvedValue(activeUser);
    await expect(strategy.validate(payload)).resolves.toEqual({
      sub: 'user-1',
      tid: 'tenant-1',
      role: 'owner',
    });
  });

  it('uses the CURRENT role from the DB (demotion takes effect immediately)', async () => {
    findUnique.mockResolvedValue({ ...activeUser, role: 'technician' });
    const result = await strategy.validate(payload); // token still says owner
    expect(result.role).toBe('technician');
  });

  it('rejects when the user no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a soft-deleted user', async () => {
    findUnique.mockResolvedValue({ ...activeUser, deletedAt: new Date() });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a locked account', async () => {
    findUnique.mockResolvedValue({
      ...activeUser,
      lockedUntil: new Date(Date.now() + 60_000),
    });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the tenant is deleted', async () => {
    findUnique.mockResolvedValue({ ...activeUser, tenant: { deletedAt: new Date() } });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the token tenant does not match the user tenant', async () => {
    findUnique.mockResolvedValue({ ...activeUser, tenantId: 'other-tenant' });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
