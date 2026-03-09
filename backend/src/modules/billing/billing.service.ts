import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PlanKey = 'basic' | 'professional' | 'business';

const PLAN_PRICE_ENV: Record<PlanKey, string> = {
  basic: 'STRIPE_PRICE_BASIC',
  professional: 'STRIPE_PRICE_PROFESSIONAL',
  business: 'STRIPE_PRICE_BUSINESS',
};

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    this.stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
  }

  /**
   * Get the current billing status for a tenant.
   */
  async getBillingStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true,
        planStatus: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        maxEmployees: true,
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    let subscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      try {
        subscription = await this.stripe.subscriptions.retrieve(
          tenant.stripeSubscriptionId,
        );
      } catch (err) {
        this.logger.warn(`Could not retrieve subscription: ${err}`);
      }
    }

    return {
      plan: tenant.plan,
      planStatus: tenant.planStatus,
      trialEndsAt: tenant.trialEndsAt,
      maxEmployees: tenant.maxEmployees,
      hasActiveSubscription: !!subscription && subscription.status === 'active',
      currentPeriodEnd: subscription
        ? new Date((subscription as any).current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: (subscription as any)?.cancel_at_period_end ?? false,
    };
  }

  /**
   * Create a Stripe Checkout session for upgrading to a paid plan.
   */
  async createCheckoutSession(tenantId: string, plan: PlanKey) {
    const priceId = this.config.get<string>(PLAN_PRICE_ENV[plan]);
    if (!priceId || priceId === 'price_REPLACE_ME') {
      throw new BadRequestException(
        'Stripe price not configured. Set the STRIPE_PRICE_* env variables.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, email: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    // If already subscribed, use billing portal instead
    if (tenant.stripeSubscriptionId) {
      throw new BadRequestException(
        'Already subscribed. Use the billing portal to change your plan.',
      );
    }

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

    // Find or create Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        name: tenant.name,
        email: tenant.email,
        metadata: { tenantId: tenant.id },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing?cancelled=1`,
      metadata: { tenantId, plan },
      subscription_data: {
        metadata: { tenantId, plan },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'es',
    });

    return { url: session.url, sessionId: session.id };
  }

  /**
   * Create a Stripe Customer Portal session for managing an existing subscription.
   */
  async createPortalSession(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });

    if (!tenant?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found for this tenant.');
    }

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
    });

    return { url: session.url };
  }

  /**
   * Handle incoming Stripe webhook events.
   * Called from the controller with the raw body for signature verification.
   */
  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Unhandled event: ${event.type}`);
    }

    return { received: true };
  }

  // ─── Webhook handlers ──────────────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const plan = session.metadata?.plan as PlanKey;
    if (!tenantId || !plan) return;

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string,
    );

    const planLimits = this.getPlanLimits(plan);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: plan as any,
        planStatus: 'active',
        stripeSubscriptionId: subscription.id,
        ...planLimits,
      },
    });

    this.logger.log(`Tenant ${tenantId} upgraded to ${plan}`);
  }

  private async onSubscriptionUpdated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    const status = this.mapStripeStatus(subscription.status);
    const plan = (subscription.metadata?.plan ?? 'basic') as PlanKey;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planStatus: status as any,
        plan: plan as any,
        ...this.getPlanLimits(plan),
      },
    });

    this.logger.log(`Tenant ${tenantId} subscription updated: ${status}`);
  }

  private async onSubscriptionDeleted(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: 'basic',
        planStatus: 'cancelled' as any,
        stripeSubscriptionId: null,
        maxEmployees: 1,
      },
    });

    this.logger.log(`Tenant ${tenantId} subscription cancelled`);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!tenant) return;

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { planStatus: 'past_due' as any },
    });

    this.logger.warn(`Payment failed for tenant ${tenant.id}`);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getPlanLimits(plan: PlanKey): { maxEmployees: number } {
    const limits: Record<PlanKey, { maxEmployees: number }> = {
      basic: { maxEmployees: 1 },
      professional: { maxEmployees: 5 },
      business: { maxEmployees: 20 },
    };
    return limits[plan] ?? limits.basic;
  }

  private mapStripeStatus(
    status: Stripe.Subscription.Status,
  ): string {
    const map: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'cancelled',
      trialing: 'trialing',
      paused: 'suspended',
      incomplete: 'trialing',
      incomplete_expired: 'cancelled',
    };
    return map[status] ?? 'active';
  }
}
