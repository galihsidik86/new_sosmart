import { Injectable } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

/**
 * TenancyService — eksekusi query Prisma di transaksi dengan GUC
 * `app.tenant_id` + `app.user_id` ter-set. Wajib dipanggil dari handler
 * yang sudah dijaga TenantGuard + TenancyInterceptor.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
  ) {}

  /** Tenant-scoped: set app.tenant_id + app.user_id. */
  async run<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    opts?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    const ctx = this.ctx.require();
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL app.tenant_id = '${ctx.tenantId}'`,
        );
        await tx.$executeRawUnsafe(
          `SET LOCAL app.user_id = '${ctx.userId}'`,
        );
        return fn(tx);
      },
      opts,
    );
  }

  /**
   * Cross-tenant query (mis. /tenants/me, daftar membership lintas tenant).
   * Hanya set `app.user_id` — `app.tenant_id` dibiarkan kosong.
   * Policy `tenants_select` & `memberships_select` mengizinkan baris
   * milik user atau tenant aktif.
   */
  async runAsUser<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
      return fn(tx);
    });
  }

  /** Bypass-aware: admin task lintas tenant (jarang dipakai). */
  async runAs<T>(
    tenantId: string,
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
      return fn(tx);
    });
  }
}
