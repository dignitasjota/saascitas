/**
 * Integration test for the Prisma tenant-guard extension. Requires a real
 * Postgres reachable via DATABASE_URL. Named *.int-spec.ts so it does NOT run
 * in the default `jest` suite (testRegex matches *.spec.ts). Run explicitly:
 *
 *   DATABASE_URL=... npx jest --rootDir src --testRegex 'int-spec\\.ts$'
 */
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-extension';
import { runInTenantScope } from '../context/tenant-context';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension());

let bCustomerId: string;

beforeAll(async () => {
  await base.appointment.deleteMany({});
  await base.bookingToken.deleteMany({});
  await base.customer.deleteMany({});
  await base.employee.deleteMany({});
  await base.user.deleteMany({});
  await base.tenant.deleteMany({});

  for (const [id, slug] of [[A, 'a'], [B, 'b']] as const) {
    await base.tenant.create({
      data: { id, name: slug.toUpperCase(), slug, email: `${slug}@t.com` },
    });
  }
  await base.customer.createMany({
    data: [
      { tenantId: A, firstName: 'A-Ana', phone: '600' },
      { tenantId: A, firstName: 'A-Alba', phone: '601' },
      { tenantId: B, firstName: 'B-Bea', phone: '700' },
    ],
  });
  bCustomerId = (await base.customer.findFirst({ where: { tenantId: B } }))!.id;
});

afterAll(async () => {
  await base.$disconnect();
});

describe('tenant-guard extension (integration)', () => {
  it('findMany without where returns only the scoped tenant', async () => {
    const rows = await runInTenantScope(A, async () => db.customer.findMany());
    expect(rows).toHaveLength(2);
    expect(rows.every((c) => c.tenantId === A)).toBe(true);
  });

  it('merges an existing where with AND, staying scoped', async () => {
    const rows = await runInTenantScope(A, async () =>
      db.customer.findMany({ where: { phone: { startsWith: '6' } } }),
    );
    expect(rows.every((c) => c.tenantId === A)).toBe(true);
  });

  it('count is scoped', async () => {
    const n = await runInTenantScope(A, async () => db.customer.count());
    expect(n).toBe(2);
  });

  it('findUnique of another tenant returns null (post-filter)', async () => {
    const leaked = await runInTenantScope(A, async () =>
      db.customer.findUnique({ where: { id: bCustomerId } }),
    );
    expect(leaked).toBeNull();
  });

  it('findUnique of own tenant is returned', async () => {
    const found = await runInTenantScope(B, async () =>
      db.customer.findUnique({ where: { id: bCustomerId } }),
    );
    expect(found?.id).toBe(bCustomerId);
  });

  it('create forces the scoped tenantId when omitted', async () => {
    const c = await runInTenantScope(A, async () =>
      db.customer.create({ data: { firstName: 'A-New', phone: '602' } as any }),
    );
    expect(c.tenantId).toBe(A);
  });

  it('create ignores a spoofed tenantId', async () => {
    const c = await runInTenantScope(A, async () =>
      db.customer.create({
        data: { firstName: 'A-Spoof', phone: '603', tenantId: B } as any,
      }),
    );
    expect(c.tenantId).toBe(A);
  });

  it('updateMany cannot reach another tenant rows', async () => {
    await runInTenantScope(A, async () =>
      db.customer.updateMany({ data: { city: 'Madrid' } }),
    );
    const b = await base.customer.findFirst({ where: { tenantId: B } });
    expect(b?.city).toBeNull();
  });

  it('is fail-open with no scope (background jobs / superadmin)', async () => {
    const all = await db.customer.count();
    expect(all).toBeGreaterThanOrEqual(5);
  });

  it('scopes queries inside an interactive $transaction', async () => {
    const n = await runInTenantScope(A, async () =>
      db.$transaction(async (tx) => tx.customer.count()),
    );
    expect(n).toBe(4); // 2 seeded + A-New + A-Spoof
  });
});
