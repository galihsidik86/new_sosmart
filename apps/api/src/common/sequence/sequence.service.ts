import { Injectable } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenantContext } from '../tenancy/tenant-context.js';

/**
 * Generator nomor dokumen — pakai SELECT ... FOR UPDATE supaya tahan
 * race condition antar request concurrent. WAJIB dipanggil di dalam
 * transaksi yang sama dengan operasi yang memakai nomor tsb.
 *
 * Contoh: JU-2026-05-0001
 *   prefix = "JU", year = 2026, month = "05", width = 4 → "JU-2026-05-0001"
 */
@Injectable()
export class SequenceService {
  constructor(private readonly ctx: TenantContext) {}

  /** Resolve kode bucket harian/bulanan (tergantung sumber dokumen). */
  static buildKode(prefix: string, date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${prefix}-${y}-${m}`;
  }

  /**
   * Ambil nomor berikutnya untuk (tenantAktif, kode). Upsert + lock.
   * Format hasil: "{prefix}-{YYYY}-{MM}-{NNNN}".
   */
  async next(
    tx: Prisma.TransactionClient,
    prefix: string,
    date: Date,
    opts: { width?: number } = {},
  ): Promise<string> {
    const tenantId = this.ctx.require().tenantId;
    const kode = SequenceService.buildKode(prefix, date);
    const width = opts.width ?? 4;

    // Bikin baris kalau belum ada (current=0), lalu lock & increment.
    await tx.$executeRaw`
      INSERT INTO sequences (tenant_id, kode, current, updated_at)
      VALUES (${tenantId}::uuid, ${kode}, 0, NOW())
      ON CONFLICT (tenant_id, kode) DO NOTHING
    `;
    const rows = await tx.$queryRaw<Array<{ current: number }>>`
      SELECT current FROM sequences
       WHERE tenant_id = ${tenantId}::uuid AND kode = ${kode}
       FOR UPDATE
    `;
    const cur = rows[0]?.current ?? 0;
    const next = cur + 1;
    await tx.$executeRaw`
      UPDATE sequences SET current = ${next}, updated_at = NOW()
       WHERE tenant_id = ${tenantId}::uuid AND kode = ${kode}
    `;
    return `${kode}-${String(next).padStart(width, '0')}`;
  }
}
