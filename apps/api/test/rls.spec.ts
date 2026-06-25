/**
 * Integration tests untuk Row-Level Security (RLS).
 *
 * Cakupan kritis untuk multi-tenant:
 *   - Tanpa app.tenant_id GUC → 0 rows visible
 *   - Dengan tenant A → hanya data tenant A
 *   - Cross-tenant insert ditolak via WITH CHECK clause
 *   - app.user_id alternatif untuk endpoint cross-tenant
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenancyService } from '../src/common/tenancy/tenancy.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { bootApp, createTestTenant, resetDb, withTenant } from './helpers.js';

describe('RLS Isolation — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let tenancy: TenancyService;
  let tA: Awaited<ReturnType<typeof createTestTenant>>;
  let tB: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    tenancy = app.get(TenancyService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    tA = await createTestTenant(prisma);
    tB = await createTestTenant(prisma);
  });

  it('runAsUser tanpa tenant_id → memberships hanya milik user itu', async () => {
    // User A login lihat membership-nya saja (1 baris, tenant A).
    const aMems = await tenancy.runAsUser(tA.userId, (tx) =>
      tx.membership.findMany(),
    );
    expect(aMems).toHaveLength(1);
    expect(aMems[0]!.tenantId).toBe(tA.tenantId);
  });

  it('run dengan tenant A → hanya akun tenant A visible', async () => {
    const ctxA = { tenantId: tA.tenantId, userId: tA.userId, role: 'OWNER', cabangIds: null };
    const accounts = await withTenant(ctx, ctxA, () =>
      tenancy.run((tx) => tx.account.findMany()),
    );
    expect(accounts.length).toBeGreaterThan(0);
    // Semua harus milik tenant A
    for (const a of accounts) {
      expect(a.tenantId).toBe(tA.tenantId);
    }
  });

  it('run dengan tenant B → hanya akun tenant B (zero leak dari A)', async () => {
    const ctxB = { tenantId: tB.tenantId, userId: tB.userId, role: 'OWNER', cabangIds: null };
    const accounts = await withTenant(ctx, ctxB, () =>
      tenancy.run((tx) => tx.account.findMany()),
    );
    for (const a of accounts) {
      expect(a.tenantId).toBe(tB.tenantId);
      expect(a.tenantId).not.toBe(tA.tenantId);
    }
  });

  it('INSERT dengan tenant_id berbeda dari konteks ditolak (WITH CHECK)', async () => {
    const ctxA = { tenantId: tA.tenantId, userId: tA.userId, role: 'OWNER', cabangIds: null };
    await expect(
      withTenant(ctx, ctxA, () =>
        tenancy.run((tx) =>
          tx.cabang.create({
            data: {
              tenantId: tB.tenantId, // BERBEDA dari context tenant A!
              kode: 'HACK', nama: 'Pencobaan',
            },
          }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('Cabang tenant A & B isolated', async () => {
    // tA dan tB masing-masing punya 1 cabang dari helper.
    const ctxA = { tenantId: tA.tenantId, userId: tA.userId, role: 'OWNER', cabangIds: null };
    const ctxB = { tenantId: tB.tenantId, userId: tB.userId, role: 'OWNER', cabangIds: null };
    const aCab = await withTenant(ctx, ctxA, () => tenancy.run((tx) => tx.cabang.findMany()));
    const bCab = await withTenant(ctx, ctxB, () => tenancy.run((tx) => tx.cabang.findMany()));
    expect(aCab).toHaveLength(1);
    expect(bCab).toHaveLength(1);
    expect(aCab[0]!.id).not.toBe(bCab[0]!.id);
  });
});
