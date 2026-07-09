import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-extension';

// Prisma delegate names (camelCase) that should route through the tenant-guard
// extension. Reassigning them on `this` lets existing services keep calling
// `this.prisma.<model>` unchanged while getting tenant scoping for free.
const DELEGATE_KEYS = [
  'tenant',
  'user',
  'employee',
  'workingHour',
  'scheduleException',
  'service',
  'employeeService',
  'customer',
  'appointment',
  'notification',
  'bookingToken',
  'refreshToken',
  'auditLog',
] as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();

    // Apply the tenant-guard extension. `$extends` returns a new client that
    // shares this connection; we re-point the model delegates (and interactive
    // $transaction) at it so every `this.prisma.<model>` call — including
    // operations inside $transaction(fn) — is tenant-scoped when a tenant is in
    // context. See tenant-extension.ts for coverage and limits.
    const extended = this.$extends(tenantGuardExtension()) as any;

    for (const key of DELEGATE_KEYS) {
      (this as any)[key] = extended[key];
    }
    this.$transaction = extended.$transaction.bind(extended);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
