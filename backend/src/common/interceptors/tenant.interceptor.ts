import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from '../context/tenant-context';

/**
 * Establishes the per-request tenant context so the Prisma tenant-guard
 * extension can scope queries to the caller's tenant.
 *
 * Superadmins are intentionally left unscoped (bypass): they operate across
 * tenants from the admin panel, and the tenant-scoped services they might hit
 * still apply their own explicit `tenantId` filters.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId: string | undefined = user?.tid;

    if (!tenantId || user?.role === 'superadmin') {
      return next.handle();
    }

    // Run the rest of the request (handler + its async continuations) inside
    // the AsyncLocalStorage store. Subscribing synchronously within run() is
    // what propagates the context to the handler's async work.
    return new Observable((subscriber) => {
      tenantStorage.run({ tenantId }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
