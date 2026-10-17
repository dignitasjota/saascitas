import { TrialsService } from './trials.service';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const prisma: any = {
    tenant: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    user: { findFirst: jest.fn() },
    employee: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const mailer: any = { sendMail: jest.fn().mockResolvedValue({}) };
  const config: any = { get: () => 'https://app.example.com/' };
  return { prisma, mailer, service: new TrialsService(prisma, mailer, config) };
}

const OWNER = { email: 'owner@example.com', firstName: 'Ana', employeeId: 'emp-owner' };

describe('TrialsService', () => {
  describe('reminders', () => {
    it('emails the owner once, 3 days before the end', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', name: 'Peluquería', timezone: 'Europe/Madrid', trialEndsAt: new Date(NOW.getTime() + 2.5 * DAY) },
      ]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(OWNER);

      const sent = await service.sendReminders(NOW);

      expect(sent).toBe(1);
      const where = prisma.tenant.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ planStatus: 'trialing', stripeSubscriptionId: null, trialReminderSentAt: null });
      expect(where.trialEndsAt.lte).toEqual(new Date(NOW.getTime() + 3 * DAY));
      const mail = mailer.sendMail.mock.calls[0][0];
      expect(mail.to).toBe('owner@example.com');
      expect(mail.template).toBe('trial-ending');
      expect(mail.subject).toBe('Tu prueba del plan Profesional termina en 3 días');
      expect(mail.context.billingUrl).toBe('https://app.example.com/billing');
    });

    it('skips a tenant already claimed by another run', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', name: 'x', timezone: 'Europe/Madrid', trialEndsAt: new Date(NOW.getTime() + DAY) },
      ]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.sendReminders(NOW)).toBe(0);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('releases the claim when the email fails so the next run retries', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', name: 'x', timezone: 'Europe/Madrid', trialEndsAt: new Date(NOW.getTime() + DAY) },
      ]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(OWNER);
      mailer.sendMail.mockRejectedValue(new Error('smtp down'));

      expect(await service.sendReminders(NOW)).toBe(0);
      expect(prisma.tenant.updateMany).toHaveBeenLastCalledWith({
        where: { id: 't1' },
        data: { trialReminderSentAt: null },
      });
    });
  });

  describe('expiry', () => {
    it('moves an expired, unpaid trial to free Basic and keeps the owner employee', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([{ id: 't1', name: 'Peluquería' }]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-old', firstName: 'Luis', lastName: 'A' },
        { id: 'emp-owner', firstName: 'Ana', lastName: 'Owner' },
        { id: 'emp-new', firstName: 'Eva', lastName: 'B' },
      ]);

      expect(await service.expireTrials(NOW)).toBe(1);

      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', planStatus: 'trialing', stripeSubscriptionId: null, trialEndsAt: { lte: NOW } },
        data: { plan: 'basic', planStatus: 'active', maxEmployees: 1 },
      });
      // Deactivated, not deleted; the owner's own employee stays active.
      expect(prisma.employee.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['emp-old', 'emp-new'] } },
        data: { isActive: false },
      });
      const mail = mailer.sendMail.mock.calls[0][0];
      expect(mail.template).toBe('trial-ended');
      expect(mail.context.keptEmployee).toBe('Ana Owner');
      expect(mail.context.deactivated).toEqual(['Luis A', 'Eva B']);
    });

    it('never touches tenants with a paid subscription', async () => {
      const { prisma, service } = setup();
      await service.expireTrials(NOW);
      expect(prisma.tenant.findMany.mock.calls[0][0].where).toMatchObject({
        planStatus: 'trialing',
        stripeSubscriptionId: null,
        trialEndsAt: { lte: NOW },
      });
    });

    it('does nothing if the tenant subscribed in the meantime (claim fails)', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([{ id: 't1', name: 'x' }]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.expireTrials(NOW)).toBe(0);
      expect(prisma.employee.updateMany).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('does not deactivate anyone when there is a single employee', async () => {
      const { prisma, mailer, service } = setup();
      prisma.tenant.findMany.mockResolvedValueOnce([{ id: 't1', name: 'x' }]);
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.employee.findMany.mockResolvedValue([{ id: 'emp-owner', firstName: 'Ana', lastName: 'Owner' }]);

      await service.expireTrials(NOW);

      expect(prisma.employee.updateMany).not.toHaveBeenCalled();
      expect(mailer.sendMail.mock.calls[0][0].context.hasDeactivated).toBe(false);
    });
  });
});
