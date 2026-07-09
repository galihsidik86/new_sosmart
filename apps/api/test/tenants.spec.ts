/**
 * Integration test untuk TenantsService — Profil Perusahaan (logo, alamat,
 * NPWP, kontak). Cakupan: getCurrent/updateProfile field-level, dan siklus
 * upload-ganti-hapus logo (file lama di disk harus ter-hapus setelah DB
 * commit sukses, bukan sebelum — lihat komentar di `updateLogo`).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { API_ROOT } from '../src/common/config/paths.js';
import { TenantsService } from '../src/modules/tenants/tenants.service.js';
import { TenantsModule } from '../src/modules/tenants/tenants.module.js';
import { bootApp, createTestTenant, resetDb, withTenant } from './helpers.js';

const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

describe('TenantsService — Profil Perusahaan', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let tenants: TenantsService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await bootApp([TenantsModule]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    tenants = app.get(TenantsService);
  });

  afterAll(async () => {
    await app.close();
  });

  function ownerCtx() {
    return { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null };
  }

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
  });

  it('getCurrent() return profil default — logoUrl null', async () => {
    const profile = await withTenant(ctx, ownerCtx(), () => tenants.getCurrent());
    expect(profile.logoUrl).toBeNull();
    expect(profile.npwp).toBe('012345678901000');
  });

  it('updateProfile() ubah alamat/email/telp dan persist', async () => {
    const updated = await withTenant(ctx, ownerCtx(), () =>
      tenants.updateProfile({
        alamat: 'Jl. Industri No. 10, Jakarta',
        email: 'info@test.id',
        telp: '021-5551234',
      }),
    );
    expect(updated.alamat).toBe('Jl. Industri No. 10, Jakarta');
    expect(updated.email).toBe('info@test.id');
    expect(updated.telp).toBe('021-5551234');

    const reread = await withTenant(ctx, ownerCtx(), () => tenants.getCurrent());
    expect(reread.alamat).toBe('Jl. Industri No. 10, Jakarta');
  });

  it('updateLogo() simpan file baru, hapus file lama dari disk setelah DB commit', async () => {
    const first = await withTenant(ctx, ownerCtx(), () => tenants.updateLogo(pngBuffer(), '.png'));
    expect(first.logoUrl).toMatch(/^\/uploads\/logos\/.+\.png$/);
    const firstPath = path.join(UPLOADS_ROOT, first.logoUrl!.replace('/uploads/', ''));
    expect(existsSync(firstPath)).toBe(true);

    const second = await withTenant(ctx, ownerCtx(), () => tenants.updateLogo(pngBuffer(), '.png'));
    expect(second.logoUrl).not.toBe(first.logoUrl);
    const secondPath = path.join(UPLOADS_ROOT, second.logoUrl!.replace('/uploads/', ''));
    expect(existsSync(secondPath)).toBe(true);
    // File lama sudah dihapus — tidak ada logo orphan menumpuk di disk.
    expect(existsSync(firstPath)).toBe(false);
  });

  it('removeLogo() set logoUrl null dan hapus file dari disk', async () => {
    const uploaded = await withTenant(ctx, ownerCtx(), () => tenants.updateLogo(pngBuffer(), '.png'));
    const filePath = path.join(UPLOADS_ROOT, uploaded.logoUrl!.replace('/uploads/', ''));
    expect(existsSync(filePath)).toBe(true);

    const removed = await withTenant(ctx, ownerCtx(), () => tenants.removeLogo());
    expect(removed.logoUrl).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });
});
