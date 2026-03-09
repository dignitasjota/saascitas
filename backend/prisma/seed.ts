import { PrismaClient, SubscriptionStatus, DayOfWeek } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up existing seed data (order matters due to FK constraints)
  await prisma.bookingToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.service.deleteMany();
  await prisma.scheduleException.deleteMany();
  await prisma.workingHour.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.tenant.deleteMany();

  // 1. Create tenant (business)
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Electricidad García',
      slug: 'electricidad-garcia',
      email: 'info@electricidad-garcia.es',
      phone: '+34 600 123 456',
      city: 'Madrid',
      planStatus: SubscriptionStatus.trialing,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.slug})`);

  // 2. Create employee
  const employee = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Carlos',
      lastName: 'García',
      email: 'carlos@electricidad-garcia.es',
      phone: '+34 600 111 222',
      color: '#3B82F6',
      isActive: true,
    },
  });
  console.log(`✅ Employee: ${employee.firstName} ${employee.lastName}`);

  // 3. Working hours (Mon–Fri 9:00–18:00)
  const DAYS: DayOfWeek[] = [
    DayOfWeek.monday,
    DayOfWeek.tuesday,
    DayOfWeek.wednesday,
    DayOfWeek.thursday,
    DayOfWeek.friday,
  ];
  for (const day of DAYS) {
    await prisma.workingHour.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '18:00',
      },
    });
  }
  console.log('✅ Working hours: Mon–Fri 09:00–18:00');

  // 4. Create services
  const services = await Promise.all([
    prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Revisión eléctrica básica',
        description: 'Inspección del cuadro eléctrico y tomas de corriente.',
        durationMinutes: 60,
        priceCents: 4900,
        color: '#F59E0B',
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Instalación de enchufe',
        description: 'Instalación de nuevos enchufes o puntos de luz.',
        durationMinutes: 90,
        priceCents: 7500,
        color: '#10B981',
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Revisión completa',
        description: 'Auditoría completa de la instalación eléctrica con informe.',
        durationMinutes: 120,
        priceCents: 9900,
        color: '#8B5CF6',
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ Services: ${services.map(s => s.name).join(', ')}`);

  // 5. Assign services to employee
  for (const service of services) {
    await prisma.employeeService.create({
      data: {
        employeeId: employee.id,
        serviceId: service.id,
        tenantId: tenant.id,
      },
    });
  }
  console.log('✅ EmployeeService links created');

  // 6. Create owner user
  const passwordHash = await hash('password123', {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      employeeId: employee.id,
      firstName: 'Carlos',
      lastName: 'García',
      email: 'carlos@electricidad-garcia.es',
      passwordHash,
      role: 'admin',
    },
  });
  console.log(`✅ User: ${user.email} / password: password123`);

  // 7. Historical appointments for metrics (last 30 days)
  const customers = [
    { firstName: 'Ana', lastName: 'Martínez', phone: '+34 600 111 001', email: 'ana@test.com' },
    { firstName: 'Pedro', lastName: 'Ruiz', phone: '+34 600 111 002', email: 'pedro@test.com' },
    { firstName: 'María', lastName: 'López', phone: '+34 600 111 003', email: 'maria@test.com' },
    { firstName: 'Jorge', lastName: 'Fernández', phone: '+34 600 111 004', email: null },
    { firstName: 'Carmen', lastName: 'Gil', phone: '+34 600 111 005', email: 'carmen@test.com' },
  ];

  const createdCustomers: string[] = [];
  for (const c of customers) {
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, ...c },
    });
    createdCustomers.push(customer.id);
  }
  console.log(`✅ Customers: ${customers.length}`);

  // Past appointments (completed / cancelled) for realistic metrics
  type ApptSeed = { daysAgo: number; hour: number; serviceIdx: number; custIdx: number; status: 'completed' | 'cancelled' };
  const pastAppts: ApptSeed[] = [
    { daysAgo: 2, hour: 9, serviceIdx: 0, custIdx: 0, status: 'completed' },
    { daysAgo: 3, hour: 10, serviceIdx: 1, custIdx: 1, status: 'completed' },
    { daysAgo: 5, hour: 11, serviceIdx: 2, custIdx: 2, status: 'completed' },
    { daysAgo: 7, hour: 9, serviceIdx: 0, custIdx: 3, status: 'cancelled' },
    { daysAgo: 9, hour: 14, serviceIdx: 1, custIdx: 4, status: 'completed' },
    { daysAgo: 12, hour: 10, serviceIdx: 0, custIdx: 0, status: 'completed' },
    { daysAgo: 14, hour: 9, serviceIdx: 2, custIdx: 1, status: 'completed' },
    { daysAgo: 16, hour: 11, serviceIdx: 1, custIdx: 2, status: 'cancelled' },
    { daysAgo: 19, hour: 10, serviceIdx: 0, custIdx: 3, status: 'completed' },
    { daysAgo: 21, hour: 15, serviceIdx: 2, custIdx: 4, status: 'completed' },
    { daysAgo: 23, hour: 9, serviceIdx: 1, custIdx: 0, status: 'completed' },
    { daysAgo: 26, hour: 11, serviceIdx: 0, custIdx: 2, status: 'completed' },
    { daysAgo: 28, hour: 14, serviceIdx: 2, custIdx: 1, status: 'completed' },
  ];

  for (const a of pastAppts) {
    const svc = services[a.serviceIdx];
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() - a.daysAgo);
    startsAt.setHours(a.hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60 * 1000);

    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        customerId: createdCustomers[a.custIdx],
        serviceId: svc.id,
        startsAt,
        endsAt,
        durationMinutes: svc.durationMinutes,
        priceCents: a.status === 'completed' ? svc.priceCents : null,
        status: a.status,
        source: 'manual',
        cancelledAt: a.status === 'cancelled' ? new Date() : null,
      },
    });
  }
  console.log(`✅ Historical appointments: ${pastAppts.length}`);

  // Future appointments (pending / confirmed)
  type FutureAppt = { daysAhead: number; hour: number; serviceIdx: number; custIdx: number; status: 'pending' | 'confirmed' };
  const futureAppts: FutureAppt[] = [
    { daysAhead: 1, hour: 9, serviceIdx: 0, custIdx: 0, status: 'confirmed' },
    { daysAhead: 2, hour: 11, serviceIdx: 1, custIdx: 1, status: 'pending' },
    { daysAhead: 3, hour: 10, serviceIdx: 2, custIdx: 2, status: 'confirmed' },
    { daysAhead: 5, hour: 14, serviceIdx: 0, custIdx: 3, status: 'pending' },
  ];

  for (const a of futureAppts) {
    const svc = services[a.serviceIdx];
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + a.daysAhead);
    startsAt.setHours(a.hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60 * 1000);

    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        customerId: createdCustomers[a.custIdx],
        serviceId: svc.id,
        startsAt,
        endsAt,
        durationMinutes: svc.durationMinutes,
        status: a.status,
        source: 'manual',
      },
    });
  }
  console.log(`✅ Future appointments: ${futureAppts.length}`);

  console.log('\n🎉 Seed complete!');
  console.log(`\n📋 Booking URL: http://localhost:3000/book/electricidad-garcia`);
  console.log(`🔐 Dashboard login: ${user.email} / password123`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
