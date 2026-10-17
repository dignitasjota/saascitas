import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../notifications/mailer.service';

// ── Mock ioredis ──────────────────────────────────────────────────────────────
// jest.mock() is hoisted — define the instance INSIDE the factory and expose it
// via a property on the constructor so it can be retrieved in beforeEach.
jest.mock('ioredis', () => {
  const instance = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    getdel: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  };
  const ctor = jest.fn().mockImplementation(() => instance);
  (ctor as any).__instance = instance;
  return { default: ctor, __esModule: true };
});

// Retrieve the shared mock instance after jest.mock has run
// eslint-disable-next-line @typescript-eslint/no-require-imports
const redisMock = (require('ioredis').default as any).__instance as {
  set: jest.Mock;
  get: jest.Mock;
  getdel: jest.Mock;
  del: jest.Mock;
};

// ── Mock @node-rs/argon2 ──────────────────────────────────────────────────────
jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  verify: jest.fn(),
}));

// ── Mock slug util ────────────────────────────────────────────────────────────
jest.mock('../../common/utils/slug', () => ({
  generateUniqueSlug: jest.fn().mockReturnValue('mi-negocio-abc123'),
}));

import { hash, verify } from '@node-rs/argon2';

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  firstName: 'Ana',
  lastName: 'García',
  role: 'owner',
  phone: null,
  tenantId: 'tenant-1',
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  deletedAt: null,
  employeeId: 'emp-1',
  tenant: {
    id: 'tenant-1',
    name: 'Mi Negocio',
    slug: 'mi-negocio-abc123',
  },
  ...overrides,
});

const mockTenant = (overrides = {}) => ({
  id: 'tenant-1',
  name: 'Mi Negocio',
  slug: 'mi-negocio-abc123',
  email: 'test@example.com',
  phone: null,
  trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  ...overrides,
});

// ── Test suite ────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailer: jest.Mocked<MailerService>;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tenant: { create: jest.fn() },
    employee: { create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    redisMock.get.mockReset();
    redisMock.getdel.mockReset();
    redisMock.set.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('access.token.jwt') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              const vals: Record<string, any> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                FRONTEND_URL: 'http://localhost:3000',
              };
              return vals[key] ?? def;
            }),
          },
        },
        {
          provide: MailerService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
    mailer = module.get(MailerService);

    // Default: refresh token create succeeds
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
  });

  // ── register ────────────────────────────────────────────────────────────────
  describe('register', () => {
    const dto = {
      companyName: 'Mi Negocio',
      firstName: 'Ana',
      lastName: 'García',
      email: 'test@example.com',
      password: 'password123',
    };

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates tenant + employee + user inside a transaction', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const tenant = mockTenant();
      const employee = { id: 'emp-1' };
      const user = mockUser();

      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          tenant: { create: jest.fn().mockResolvedValue(tenant) },
          employee: { create: jest.fn().mockResolvedValue(employee) },
          user: { create: jest.fn().mockResolvedValue(user) },
        }),
      );

      const result = await service.register(dto);

      expect(result).toMatchObject({
        user: { id: 'user-1', email: 'test@example.com', role: 'owner' },
        tenant: { id: 'tenant-1', slug: 'mi-negocio-abc123' },
        accessToken: 'access.token.jwt',
      });
      expect(result.refreshToken).toBeDefined();
    });

    it('starts a 14-day trial of the Professional plan', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const tenantCreate = jest.fn().mockResolvedValue(mockTenant());
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          tenant: { create: tenantCreate },
          employee: { create: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
          user: { create: jest.fn().mockResolvedValue(mockUser()) },
        }),
      );

      await service.register(dto);

      const data = tenantCreate.mock.calls[0][0].data;
      expect(data).toMatchObject({ plan: 'professional', planStatus: 'trialing', maxEmployees: 5 });
      const days = (data.trialEndsAt.getTime() - Date.now()) / (24 * 3600 * 1000);
      expect(days).toBeGreaterThan(13.99);
      expect(days).toBeLessThanOrEqual(14);
    });

    it('sends welcome email after successful registration (fire-and-forget)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const tenant = mockTenant();
      const user = mockUser();

      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          tenant: { create: jest.fn().mockResolvedValue(tenant) },
          employee: { create: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
          user: { create: jest.fn().mockResolvedValue(user) },
        }),
      );

      await service.register(dto);

      // Allow micro-task queue to flush the fire-and-forget promise
      await Promise.resolve();
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'welcome' }),
      );
    });

    it('hashes the password before storing', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          tenant: { create: jest.fn().mockResolvedValue(mockTenant()) },
          employee: { create: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
          user: { create: jest.fn().mockResolvedValue(mockUser()) },
        }),
      );

      await service.register(dto);
      expect(hash).toHaveBeenCalledWith('password123', expect.any(Object));
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────
  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password123' };

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with lock message when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ lockedUntil }));

      await expect(service.login(dto)).rejects.toThrow(/locked/i);
    });

    it('increments failedLoginAttempts on wrong password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ failedLoginAttempts: 2 }));
      (verify as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue({});

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: 3 }),
        }),
      );
    });

    it('locks account when failedLoginAttempts reaches MAX (5)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ failedLoginAttempts: 4 }));
      (verify as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue({});

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('returns tokens and resets failed attempts on successful login', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());
      (verify as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result).toMatchObject({
        user: { email: 'test@example.com', role: 'owner' },
        tenant: { id: 'tenant-1' },
        accessToken: 'access.token.jwt',
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────
  describe('refresh', () => {
    const storedToken = (overrides = {}) => ({
      id: 'rt-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: mockUser(),
      ...overrides,
    });

    it('throws UnauthorizedException when token is not found', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('looks the token up regardless of revocation (so reuse is detectable)', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(service.refresh('t')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.findFirst.mock.calls[0][0].where).not.toHaveProperty(
        'revokedAt',
      );
    });

    it('throws UnauthorizedException when token is expired', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('atomically revokes the old token and issues a new pair', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(storedToken());
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh('valid-raw-token');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: 'family-1' }),
        }),
      );
      expect(result.accessToken).toBe('access.token.jwt');
      expect(result.refreshToken).toBeDefined();
    });

    it('revokes the entire family when an already-rotated token is replayed', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(
        storedToken({ revokedAt: new Date(Date.now() - 60 * 60 * 1000) }),
      );
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh('replayed-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('tolerates a concurrent refresh from another tab within the grace window', async () => {
      mockPrisma.refreshToken.findFirst
        .mockResolvedValueOnce(storedToken({ revokedAt: new Date(Date.now() - 2000) }))
        .mockResolvedValueOnce({ id: 'rt-2' }); // live successor in the family

      const result = await service.refresh('just-rotated-token');

      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('treats a recent reuse as theft when the family has no live token (e.g. after logout)', async () => {
      mockPrisma.refreshToken.findFirst
        .mockResolvedValueOnce(storedToken({ revokedAt: new Date(Date.now() - 2000) }))
        .mockResolvedValueOnce(null);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('t')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      ['deleted user', { user: mockUser({ deletedAt: new Date() }) }],
      ['locked user', { user: mockUser({ lockedUntil: new Date(Date.now() + 60_000) }) }],
      [
        'deleted tenant',
        { user: mockUser({ tenant: { id: 'tenant-1', name: 'x', slug: 'x', deletedAt: new Date() } }) },
      ],
    ])('refuses to refresh for a %s and revokes the family', async (_label, overrides) => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(storedToken(overrides));
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh('t')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'family-1', revokedAt: null } }),
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('revokes the whole token family', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({ familyId: 'family-1' });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-refresh-token');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not throw when token is not found (idempotent)', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(service.logout('unknown-token')).resolves.not.toThrow();
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── forgotPassword ──────────────────────────────────────────────────────────
  describe('forgotPassword', () => {
    it('silently returns when user is not found (anti-enumeration)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'unknown@example.com' }),
      ).resolves.toBeUndefined();

      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('stores reset token in Redis and sends email when user exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());

      await service.forgotPassword({ email: 'test@example.com' });

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('pwd_reset:'),
        'user-1',
        'EX',
        3600,
      );
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'password-reset' }),
      );
    });
  });

  // ── resetPassword ───────────────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('throws BadRequestException when Redis returns no userId', async () => {
      redisMock.getdel.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'invalid', newPassword: 'newpass123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates password hash and revokes all refresh tokens on success', async () => {
      redisMock.getdel.mockResolvedValue('user-1');
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.resetPassword({ token: 'valid-token', newPassword: 'newpass123' });

      expect(hash).toHaveBeenCalledWith('newpass123', expect.any(Object));
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
      expect(redisMock.getdel).toHaveBeenCalledWith(expect.stringMatching(/^pwd_reset:/));
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
    });
  });
});
