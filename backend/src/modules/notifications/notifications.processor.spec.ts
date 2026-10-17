import { NotificationsProcessor } from './notifications.processor';

const APPT = {
  id: 'appt-1',
  tenantId: 'tenant-1',
  customerId: 'cust-1',
  status: 'pending',
  // 08:00 UTC = 10:00 in Madrid (CEST, UTC+2)
  startsAt: new Date('2099-06-10T08:00:00.000Z'),
  durationMinutes: 60,
  priceCents: 5000,
  tenant: { name: 'Electricidad García', phone: '600000000', timezone: 'Europe/Madrid' },
  customer: { firstName: 'Ana', lastName: 'López', email: 'ana@example.com' },
  employee: { firstName: 'Carlos', lastName: 'García' },
  service: { name: 'Revisión' },
};

function setup(appt: any = APPT) {
  const prisma: any = {
    appointment: { findUnique: jest.fn().mockResolvedValue(appt) },
    bookingToken: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve({ token: `${where.action}-tok` }),
      ),
    },
    notification: { create: jest.fn() },
  };
  const mailer: any = { sendMail: jest.fn().mockResolvedValue({}) };
  return { processor: new NotificationsProcessor(prisma, mailer), mailer };
}

describe('NotificationsProcessor', () => {
  const OLD_ENV = process.env.FRONTEND_URL;
  beforeAll(() => (process.env.FRONTEND_URL = 'https://app.example.com/'));
  afterAll(() => (process.env.FRONTEND_URL = OLD_ENV));

  it('renders the confirmation in the business timezone with frontend links', async () => {
    const { processor, mailer } = setup();
    await processor.process({
      name: 'booking_confirmation',
      data: { type: 'booking_confirmation', appointmentId: 'appt-1' },
    } as any);

    const { subject, context } = mailer.sendMail.mock.calls[0][0];
    expect(subject).toBe('Cita registrada — Electricidad García');
    expect(context.time).toBe('10:00');
    expect(context.date).toBe('miércoles, 10 de junio de 2099');
    expect(context.confirmUrl).toBe('https://app.example.com/cita/confirmar/confirm-tok');
    expect(context.cancelUrl).toBe('https://app.example.com/cita/cancelar/cancel-tok');
  });

  it('says "confirmada" only for confirmed appointments', async () => {
    const { processor, mailer } = setup({ ...APPT, status: 'confirmed' });
    await processor.process({
      name: 'booking_confirmation',
      data: { type: 'booking_confirmation', appointmentId: 'appt-1' },
    } as any);
    expect(mailer.sendMail.mock.calls[0][0].subject).toBe(
      'Cita confirmada — Electricidad García',
    );
  });

  it('renders the reminder time in the business timezone', async () => {
    const { processor, mailer } = setup();
    await processor.process({
      name: 'booking_reminder',
      data: { type: 'booking_reminder', appointmentId: 'appt-1' },
    } as any);
    const { context } = mailer.sendMail.mock.calls[0][0];
    expect(context.time).toBe('10:00');
    expect(context.date).toBe('miércoles, 10 de junio');
  });
});
