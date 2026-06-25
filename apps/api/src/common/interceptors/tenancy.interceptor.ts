import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext, type TenantCtx } from '../tenancy/tenant-context.js';

/**
 * TenancyInterceptor — membungkus seluruh eksekusi handler & service downstream
 * di dalam `AsyncLocalStorage`. Wajib dipasang berpasangan dengan TenantGuard:
 *
 *   @UseGuards(TenantGuard)
 *   @UseInterceptors(TenancyInterceptor)
 *
 * Atau global, tapi guard mesti tetap eksplisit per controller karena ada
 * endpoint publik (login) yang tidak butuh tenant.
 */
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  constructor(private readonly ctx: TenantContext) {}

  intercept(execCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = execCtx.switchToHttp().getRequest();
    const tenantCtx: TenantCtx | undefined = req.tenantCtx;
    if (!tenantCtx) {
      // Tidak ada konteks tenant — lewat saja (mis. endpoint cross-tenant).
      return next.handle();
    }
    return new Observable((subscriber) => {
      this.ctx.run(tenantCtx, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
