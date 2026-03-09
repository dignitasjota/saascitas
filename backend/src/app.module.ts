import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  ],
  providers: [
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
