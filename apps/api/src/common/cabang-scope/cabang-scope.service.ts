import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@lentera/db';
import { TenantContext } from '../tenancy/tenant-context.js';

/**
 * Helper untuk per-cabang access control. Di-konsumsi services list/byId
 * supaya user yang membership-nya restricted ke cabang tertentu hanya bisa
 * lihat data cabang tsb.
 *
 * `cabangIds = null` → akses semua cabang dalam tenant (OWNER/ADMIN biasanya).
 * `cabangIds = [...]` → restricted ke cabang itu saja.
 *
 * Pattern pemakaian di service.list():
 * ```ts
 * const where: Prisma.XxxWhereInput = {};
 * const scope = this.cabangScope.cabangIdsForWhere();
 * if (scope) where.cabangId = { in: scope };
 * ```
 */
@Injectable()
export class CabangScopeService {
  constructor(private readonly ctx: TenantContext) {}

  /** Return cabangIds array kalau restricted, null kalau akses semua. */
  get cabangIds(): string[] | null {
    return this.ctx.require().cabangIds;
  }

  /** Untuk dipake di Prisma where: `{ in: [...] }` kalau restricted, else null. */
  cabangIdsForWhere(): string[] | null {
    return this.cabangIds;
  }

  /** true kalau user akses semua cabang (no restriction). */
  hasFullAccess(): boolean {
    return this.cabangIds === null;
  }

  /** Single-cabang user → return id. Else null. UI pakai ini untuk hide dropdown. */
  defaultCabangId(): string | null {
    const ids = this.cabangIds;
    if (ids && ids.length === 1) return ids[0]!;
    return null;
  }

  /**
   * Throw kalau user tidak punya akses ke cabang ini. Dipake di create/update
   * untuk validasi input.cabangId, dan di byId/byNomor untuk validasi resource
   * yang dibaca.
   */
  assertAccess(cabangId: string): void {
    if (this.hasFullAccess()) return;
    if (!this.cabangIds!.includes(cabangId)) {
      throw new ForbiddenException(
        'User tidak punya akses ke cabang ini',
      );
    }
  }

  /**
   * Sama seperti assertAccess() (blokir role restricted yang cabangId-nya
   * di luar akses), TAPI juga verifikasi cabangId benar-benar ada di tenant
   * ini — assertAccess() saja no-op untuk OWNER/ADMIN (cabangIds===null),
   * jadi cabangId tenant lain (kalau ketebak) bisa lolos FK constraint
   * (tidak kena RLS di INSERT/UPDATE, beda dari SELECT biasa). Dipakai di
   * titik yang cabangId-nya jadi FK langsung ke .create()/.update() —
   * bukan di read-path (list/byId), yang cukup assertAccess() biasa karena
   * row-nya sendiri sudah RLS-scoped.
   */
  async assertOwnedByTenant(tx: Prisma.TransactionClient, cabangId: string): Promise<void> {
    this.assertAccess(cabangId);
    const cabang = await tx.cabang.findUnique({ where: { id: cabangId }, select: { id: true } });
    if (!cabang) throw new BadRequestException('Cabang tidak ditemukan');
  }
}
