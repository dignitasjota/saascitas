import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { PrismaService } from '../../common/prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string, defaultVal?: string) => {
    const map: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_WEBHOOK_SECRET: 'whsec_mock',
      STRIPE_PRICE_BASIC: 'price_basic',
      STRIPE_PRICE_PROFESSIONAL: 'price_professional',
      STRIPE_PRICE_BUSINESS: 'price_business',
      FRONTEND_URL: 'http://localhost:3000',
    };
    return map[key] ?? defaultVal ?? '';
  }),
};

// Mock the Stripe constructor (hoisted by jest — define functions inside factory)
jest.mock('stripe', () => {
  const instance = {
    subscriptions: { retrieve: jest.fn() },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
  };
  const ctor = jest.fn().mockImplementation(() => instance);
  (ctor as any).__instance = instance;
  return { default: ctor, __esModule: true };
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BillingService', () => {
  let service: BillingService;
  let stripe: any; // mocked instance

  const TENANT_ID = 'tenant-uuid';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    // Retrieve the shared mock instance created inside jest.mock factory
    const StripeCtor = require('stripe').default;
    stripe = StripeCtor.__instance;
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPlanLimits ─────────────────────────────────────────────────────────

  describe('getPlanLimits (via onCheckoutCompleted)', () => {
    it('basic plan → 1 employee', () => {
      // Access private method via any
      const limits = (service as any).getPlanLimits('basic');
      expect(limits.maxEmployees).toBe(1);
    });

    it('professional plan → 5 employees', () => {
      const limits = (service as any).getPlanLimits('professional');
      expect(limits.maxEmployees).toBe(5);
    });

    it('business plan → 20 employees', () => {
      const limits = (service as any).getPlanLimits('business');
      expect(limits.maxEmployees).toBe(20);
    });

    it('unknown plan falls back to basic', () => {
      const limits = (service as any).getPlanLimits('unknown');
      expect(limits.maxEmployees).toBe(1);
    });
  });

  // ─── mapStripeStatus ───────────────────────────────────────────────────────

  describe('mapStripeStatus', () => {
    const cases: [string, string][] = [
      ['active', 'active'],
      ['past_due', 'past_due'],
      ['unpaid', 'past_due'],
      ['canceled', 'cancelled'],
      ['trialing', 'trialing'],
      ['paused', 'suspended'],
      ['incomplete', 'trialing'],
      ['incomplete_expired', 'cancelled'],
    ];

    test.each(cases)('stripe "%s" → internal "%s"', (stripeStatus, expected) => {
      const result = (service as any).mapStripeStatus(stripeStatus);
      expect(result).toBe(expected);
    });

    it('unknown status defaults to active', () => {
      const result = (service as any).mapStripeStatus('some_unknown_status');
      expect(result).toBe('active');
    });
  });

  // ─── getBillingStatus ──────────────────────────────────────────────────────

  describe('getBillingStatus', () => {
    it('throws NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getBillingStatus(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns billing status without subscription', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        plan: 'basic',
        planStatus: 'trialing',
        trialEndsAt: new Date('2026-04-01'),
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        maxEmployees: 1,
      });

      const result = await service.getBillingStatus(TENANT_ID);

      expect(result.plan).toBe('basic');
      expect(result.planStatus).toBe('trialing');
      expect(result.hasActiveSubscription).toBe(false);
      expect(result.currentPeriodEnd).toBeNull();
      expect(result.cancelAtPeriodEnd).toBe(false);
    });

    it('retrieves Stripe subscription when subscriptionId exists', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        plan: 'professional',
        planStatus: 'active',
        trialEndsAt: null,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        maxEmployees: 5,
      });

      const mockSubscription = {
        status: 'active',
        current_period_end: 1750000000,
        cancel_at_period_end: false,
      };
      stripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      const result = await service.getBillingStatus(TENANT_ID);

      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
      expect(result.hasActiveSubscription).toBe(true);
      expect(result.cancelAtPeriodEnd).toBe(false);
    });
  });

  // ─── createCheckoutSession ─────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('throws BadRequestException when price not configured', async () => {
      mockConfig.get.mockReturnValueOnce('price_REPLACE_ME');
      await expect(
        service.createCheckoutSession(TENANT_ID, 'professional'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when already subscribed', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: 'Test',
        email: 'test@test.com',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_existing',
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, 'professional'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates Stripe customer if none exists', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: 'Test Biz',
        email: 'test@test.com',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
      mockPrisma.tenant.update.mockResolvedValue({});
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
        id: 'cs_test_123',
      });

      const result = await service.createCheckoutSession(TENANT_ID, 'professional');

      expect(stripe.customers.create).toHaveBeenCalledWith({
        name: 'Test Biz',
        email: 'test@test.com',
        metadata: { tenantId: TENANT_ID },
      });
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { stripeCustomerId: 'cus_new' },
      });
      expect(result.url).toBe('https://checkout.stripe.com/session');
    });

    it('reuses existing Stripe customer', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: 'Test Biz',
        email: 'test@test.com',
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: null,
      });
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
        id: 'cs_test_456',
      });

      await service.createCheckoutSession(TENANT_ID, 'professional');

      expect(stripe.customers.create).not.toHaveBeenCalled();
    });
  });
});
