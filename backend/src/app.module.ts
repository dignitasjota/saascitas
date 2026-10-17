import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ServicesModule } from './modules/services/services.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { BookingModule } from './modules/booking/booking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { TrialsModule } from './modules/trials/trials.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Rate limiting: default 100 req/min, override per route with @Throttle()
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    EmployeesModule,
    ServicesModule,
    CustomersModule,
    AppointmentsModule,
    BookingModule,
    NotificationsModule,
    MetricsModule,
    BillingModule,
    AdminModule,
    TrialsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limit guard (global)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global auth guard — all routes require JWT unless @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global roles guard — check @Roles() decorator
    { provide: APP_GUARD, useClass: RolesGuard },
    // Set tenant context on every authenticated request
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    // Global exception handler (RFC 7807)
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
