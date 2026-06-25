import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantCtx {
  tenantId: string;
  userId: string;
  role: string;
  cabangIds: string[] | null; // null = akses semua cabang
}

/**
 * AsyncLocalStorage berbasis konteks tenant. Di-set oleh TenantGuard
 * setelah JWT divalidasi & membership di-load.
 */
@Injectable()
export class TenantContext {
  private readonly als = new AsyncLocalStorage<TenantCtx>();

  run<T>(ctx: TenantCtx, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  get(): TenantCtx | undefined {
    return this.als.getStore();
  }

  require(): TenantCtx {
    const ctx = this.als.getStore();
    if (!ctx) {
      throw new Error(
        'TenantContext.require(): konteks tenant belum di-set. Pasang TenantGuard di route ini.',
      );
    }
    return ctx;
  }
}
