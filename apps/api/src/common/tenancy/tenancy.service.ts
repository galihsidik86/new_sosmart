import { Injectable } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

/**
 * TenancyService — eksekusi query Prisma di transaksi dengan GUC
 * `app.tenant_id` + `app.user_id` ter-set. Wajib dipanggil dari handler
 * yang sudah dijaga TenantGuard + TenancyInterceptor.
 *
 * Implementasi pakai `set_config($name, $value, is_local=true)` — Postgres
 * built-in yang menerima value sebagai parameter, jadi tidak ada risiko
 * SQL injection walau UUID sudah divalidasi TenantGuard.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(v: string, label: string): void {
  if (!UUID_RE.test(v)) {
    throw new Error(`TenancyService: ${label} bukan UUID valid`);
  }
}

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
    assertUuid(ctx.tenantId, 'tenantId');
    assertUuid(ctx.userId, 'userId');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
        return fn(tx);
      },
      // maxWait: beri lebih banyak waktu MEMULAI transaksi saat pool sibuk
      // (default 2s → 10s) supaya lonjakan singkat MENUNGGU koneksi, bukan
      // langsung "Unable to start a transaction". timeout: durasi maks (5s → 20s).
      { maxWait: 10_000, timeout: 20_000, ...opts },
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
    assertUuid(userId, 'userId');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
        return fn(tx);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  /** Bypass-aware: admin task lintas tenant (jarang dipakai). */
  async runAs<T>(
    tenantId: string,
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    assertUuid(tenantId, 'tenantId');
    assertUuid(userId, 'userId');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
        return fn(tx);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }
}
