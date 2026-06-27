import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { GL_CONFIG_DEFAULTS, GlConfigKey } from '@lentera/shared/enums';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';

/**
 * Resolusi akun default per-tenant via tabel `gl_config`.
 *
 * Pattern lookup:
 *   1. Cari row gl_config{key, tenant_id}. Kalau ada → pakai accountId-nya.
 *   2. Fallback: ambil kode default dari GL_CONFIG_DEFAULTS, cari Account.kode.
 *   3. Kalau di-kedua-nya tidak ketemu → throw (helper akan kasih pesan jelas).
 *
 * Cache per (tenantId, key) di-bypass: keseluruhan logika sudah scoped di
 * dalam satu transaction tenancy.run() — overhead 1 query saja, cukup murah.
 */
@Injectable()
export class GlConfigService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  /**
   * In-transaction variant (caller sudah pegang tx). Resolve key → accountId.
   */
  async getAccountIdInTx(
    tx: Prisma.TransactionClient,
    key: GlConfigKey,
  ): Promise<string> {
    const row = await tx.glConfig.findFirst({ where: { key } });
    if (row) return row.accountId;
    const kode = GL_CONFIG_DEFAULTS[key];
    const acc = await tx.account.findFirst({
      where: { kode },
      select: { id: true },
    });
    if (!acc) {
      throw new NotFoundException(
        `Akun default untuk ${key} (${kode}) tidak ditemukan. ` +
        `Set di Pengaturan › Akun Default atau buat akun dengan kode "${kode}".`,
      );
    }
    return acc.id;
  }

  /** Public wrapper (membuat transaksi sendiri). */
  getAccountId(key: GlConfigKey): Promise<string> {
    return this.tenancy.run((tx) => this.getAccountIdInTx(tx, key));
  }

  // ----------------------------------------------------
  // CRUD untuk halaman pengaturan
  // ----------------------------------------------------

  /**
   * List semua config + default kode + resolved accountId (jika ada).
   * UI dipakai untuk render form dropdown.
   */
  list() {
    return this.tenancy.run(async (tx) => {
      const rows = await tx.glConfig.findMany({
        include: { account: { select: { id: true, kode: true, nama: true } } },
      });
      const byKey = new Map(rows.map((r) => [r.key, r]));
      return Object.entries(GL_CONFIG_DEFAULTS).map(([key, defaultKode]) => {
        const row = byKey.get(key);
        return {
          key,
          defaultKode,
          accountId: row?.accountId ?? null,
          account: row?.account ?? null,
        };
      });
    });
  }

  /** Upsert: set accountId untuk key. accountId=null → hapus (kembali ke default). */
  async upsert(key: string, accountId: string | null) {
    const tenantId = this.ctx.require().tenantId;
    if (!(key in GL_CONFIG_DEFAULTS)) {
      throw new BadRequestException(`Key "${key}" tidak dikenal`);
    }
    return this.tenancy.run(async (tx) => {
      if (!accountId) {
        await tx.glConfig.deleteMany({ where: { key } });
        return { key, accountId: null };
      }
      // Validate account exists in this tenant (RLS already scopes).
      const acc = await tx.account.findUnique({
        where: { id: accountId }, select: { id: true, isPostable: true },
      });
      if (!acc) throw new BadRequestException('Akun tidak ditemukan');
      if (!acc.isPostable) {
        throw new BadRequestException('Akun harus postable (leaf), bukan akun induk');
      }
      await tx.glConfig.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, accountId },
        update: { accountId },
      });
      return { key, accountId };
    });
  }
}
