import { Injectable } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { saveLogo, deleteLogoFile } from '../../common/storage/logo-storage.js';
import { API_ROOT } from '../../common/config/paths.js';
import type { UpdateTenantInput } from '@lentera/shared/schemas';

const PROFILE_SELECT = {
  id: true,
  nama: true,
  npwp: true,
  isPkp: true,
  pkpNo: true,
  alamat: true,
  email: true,
  telp: true,
  logoUrl: true,
} as const;

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  /**
   * Daftar tenant + role yang user punya. Cross-tenant query —
   * pakai runAsUser supaya RLS pakai policy `*_select` (user_id match)
   * tanpa perlu app.tenant_id.
   */
  async listMembershipsForUser(userId: string) {
    const memberships = await this.tenancy.runAsUser(userId, (tx) =>
      tx.membership.findMany({
        where: { userId },
        include: {
          tenant: {
            select: {
              id: true,
              nama: true,
              npwp: true,
              isPkp: true,
              alamat: true,
            },
          },
          cabang: {
            include: {
              cabang: {
                select: { id: true, kode: true, nama: true, isPusat: true },
              },
            },
          },
        },
        orderBy: { tenant: { nama: 'asc' } },
      }),
    );

    return memberships.map((m) => ({
      tenantId: m.tenant.id,
      tenant: m.tenant,
      role: m.role,
      cabang: m.cabang.length ? m.cabang.map((mc) => mc.cabang) : null,
    }));
  }

  /** Profil perusahaan (tenant aktif) — dipakai halaman Pengaturan > Profil Perusahaan. */
  getCurrent() {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run((tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: PROFILE_SELECT }),
    );
  }

  /**
   * Tulis branding publik (nama + logoUrl) ke uploads/branding.json — dipakai
   * halaman login yang pra-auth (tidak punya konteks tenant). Disajikan statis
   * via /uploads/branding.json. Non-fatal kalau gagal tulis.
   */
  private async writeBranding() {
    const tenantId = this.ctx.require().tenantId;
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nama: true, logoUrl: true } }),
    );
    try {
      await writeFile(
        path.join(API_ROOT, 'uploads', 'branding.json'),
        JSON.stringify({ nama: t.nama, logoUrl: t.logoUrl }),
      );
    } catch { /* non-fatal */ }
  }

  async updateProfile(input: UpdateTenantInput) {
    const tenantId = this.ctx.require().tenantId;
    const updated = await this.tenancy.run((tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: input, select: PROFILE_SELECT }),
    );
    await this.writeBranding();
    return updated;
  }

  async updateLogo(buffer: Buffer, ext: string) {
    const tenantId = this.ctx.require().tenantId;
    const before = await this.tenancy.run((tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { logoUrl: true } }),
    );
    const logoUrl = await saveLogo(tenantId, buffer, ext);
    const updated = await this.tenancy.run((tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { logoUrl }, select: { logoUrl: true } }),
    );
    // File lama dihapus SETELAH DB commit sukses — kalau update gagal,
    // logo lama masih valid/referenced.
    await deleteLogoFile(before.logoUrl);
    await this.writeBranding();
    return updated;
  }

  async removeLogo() {
    const tenantId = this.ctx.require().tenantId;
    const before = await this.tenancy.run((tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { logoUrl: true } }),
    );
    const updated = await this.tenancy.run((tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { logoUrl: null }, select: { logoUrl: true } }),
    );
    await deleteLogoFile(before.logoUrl);
    await this.writeBranding();
    return updated;
  }
}
