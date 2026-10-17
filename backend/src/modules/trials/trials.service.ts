import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../notifications/mailer.service';
import {
  PLAN_MAX_EMPLOYEES,
  PLAN_MAX_MONTHLY_APPOINTMENTS,
  TRIAL_REMINDER_DAYS,
} from '../../common/constants/plans';
import { formatLongDateEs } from '../notifications/notifications.utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'Europe/Madrid';

/**
 * Lifecycle of the free trial (Professional plan for 14 days, no card):
 *  - TRIAL_REMINDER_DAYS before the end: "your trial ends soon" email.
 *  - At the end, if the tenant never subscribed: drop to the free Basic plan
 *    (1 employee, 100 appointments/month). Nothing is deleted; employees above
 *    the limit are deactivated (the owner's own employee is kept) and the
 *    owner can choose which one stays from the Employees page.
 *
 * Paid subscriptions (stripeSubscriptionId set) are managed by Stripe and are
 * never touched here. Every transition is a conditional update, so running
 * the job twice (or on several instances) is harmless.
 */
@Injectable()
export class TrialsService {
  private readonly logger = new Logger(TrialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async run(now: Date = new Date()) {
    const reminded = await this.sendReminders(now);
    const expired = await this.expireTrials(now);
    if (reminded || expired) {
      this.logger.log(`Trials: ${reminded} reminder(s) sent, ${expired} trial(s) ended`);
    }
    return { reminded, expired };
  }

  // ─── Reminders ──────────────────────────────────────────────────────────────

  async sendReminders(now: Date): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        planStatus: 'trialing',
        stripeSubscriptionId: null,
        deletedAt: null,
        trialReminderSentAt: null,
        trialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * DAY_MS) },
      },
      select: { id: true, name: true, timezone: true, trialEndsAt: true },
    });

    let sent = 0;
    for (const tenant of tenants) {
      // Claim first so concurrent runs don't send it twice.
      const claim = await this.prisma.tenant.updateMany({
        where: { id: tenant.id, trialReminderSentAt: null },
        data: { trialReminderSentAt: now },
      });
      if (claim.count === 0) continue;

      const owner = await this.findOwner(tenant.id);
      if (!owner) continue;

      const daysLeft = Math.max(1, Math.ceil((tenant.trialEndsAt!.getTime() - now.getTime()) / DAY_MS));
      try {
        await this.mailer.sendMail({
          to: owner.email,
          subject: `Tu prueba del plan Profesional termina en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`,
          template: 'trial-ending',
          context: {
            name: owner.firstName,
            businessName: tenant.name,
            daysLeft,
            daysLeftPlural: daysLeft !== 1,
            endDate: formatLongDateEs(tenant.trialEndsAt!, tenant.timezone || DEFAULT_TZ),
            basicMaxAppointments: PLAN_MAX_MONTHLY_APPOINTMENTS.basic,
            billingUrl: `${this.frontendUrl()}/billing`,
          },
        });
        sent++;
      } catch (err) {
        // Release the claim so the next run retries.
        await this.prisma.tenant.updateMany({
          where: { id: tenant.id },
          data: { trialReminderSentAt: null },
        });
        this.logger.error(`Trial reminder for tenant ${tenant.id} failed: ${err}`);
      }
    }
    return sent;
  }

  // ─── Expiry ─────────────────────────────────────────────────────────────────

  async expireTrials(now: Date): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        planStatus: 'trialing',
        stripeSubscriptionId: null,
        deletedAt: null,
        trialEndsAt: { lte: now },
      },
      select: { id: true, name: true },
    });

    let expired = 0;
    for (const tenant of tenants) {
      const result = await this.downgradeToBasic(tenant.id, now);
      if (!result) continue;
      expired++;

      if (!result.owner) continue;
      try {
        await this.mailer.sendMail({
          to: result.owner.email,
          subject: 'Tu prueba ha terminado — sigues en el plan Básico gratuito',
          template: 'trial-ended',
          context: {
            name: result.owner.firstName,
            businessName: tenant.name,
            basicMaxAppointments: PLAN_MAX_MONTHLY_APPOINTMENTS.basic,
            deactivated: result.deactivated.map((e) => `${e.firstName} ${e.lastName}`),
            hasDeactivated: result.deactivated.length > 0,
            keptEmployee: result.kept ? `${result.kept.firstName} ${result.kept.lastName}` : null,
            billingUrl: `${this.frontendUrl()}/billing`,
            employeesUrl: `${this.frontendUrl()}/employees`,
          },
        });
      } catch (err) {
        // The downgrade already happened; the email is informative only.
        this.logger.error(`Trial-ended email for tenant ${tenant.id} failed: ${err}`);
      }
    }
    return expired;
  }

  /** Move one tenant to Basic. Returns null if it no longer qualifies. */
  private async downgradeToBasic(tenantId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          planStatus: 'trialing',
          stripeSubscriptionId: null,
          trialEndsAt: { lte: now },
        },
        data: {
          plan: 'basic',
          planStatus: 'active',
          maxEmployees: PLAN_MAX_EMPLOYEES.basic,
        },
      });
      if (claim.count === 0) return null;

      const owner = await tx.user.findFirst({
        where: { tenantId, role: 'owner', deletedAt: null },
        select: { email: true, firstName: true, employeeId: true },
      });

      const active = await tx.employee.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { createdAt: 'asc' },
      });

      // Keep the owner's own employee first (if active), then the oldest ones,
      // up to the Basic limit; deactivate the rest.
      const ownerEmployee = active.find((e) => e.id === owner?.employeeId);
      const ordered = ownerEmployee
        ? [ownerEmployee, ...active.filter((e) => e.id !== ownerEmployee.id)]
        : active;
      const kept = ordered[0] ?? null;
      const deactivated = ordered.slice(PLAN_MAX_EMPLOYEES.basic);

      if (deactivated.length > 0) {
        await tx.employee.updateMany({
          where: { id: { in: deactivated.map((e) => e.id) } },
          data: { isActive: false },
        });
      }

      return { owner, kept, deactivated };
    });
  }

  private async findOwner(tenantId: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, role: 'owner', deletedAt: null },
      select: { email: true, firstName: true },
    });
  }

  private frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
  }
}
