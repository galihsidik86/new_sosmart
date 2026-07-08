import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import type { UpdateAccountInput } from '@lentera/shared/schemas';
import { Prisma, AccountKind, NormalBalance } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import type { ImportResult } from '../../common/http/multipart.js';

/// Akun yang subsidiary ledger-nya dikelola prosedur Saldo Awal Terintegrasi —
/// saldoAwal-nya harus derived dari subsidiary (piutang per customer, utang
/// per vendor, kartu stok per item), bukan angka lump-sum yang bisa mismatch.
const SALDO_AWAL_SUBSIDIARY_KEYS = ['PIUTANG_USAHA', 'UTANG_USAHA', 'PERSEDIAAN'] as const;
const SALDO_AWAL_SUBSIDIARY_LABEL: Record<(typeof SALDO_AWAL_SUBSIDIARY_KEYS)[number], string> = {
  PIUTANG_USAHA: 'piutang per pelanggan',
  UTANG_USAHA: 'utang per vendor',
  PERSEDIAAN: 'kartu stok per item',
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
    private readonly glConfig: GlConfigService,
  ) {}

  /**
   * Import COA dari .xlsx. Headers wajib: Kode, Nama, Jenis, Saldo Normal.
   * Optional: Parent (kode), Postable (Ya/Tidak), Saldo Awal, Aktif.
   *
   * Catatan: parent harus sudah ada (di DB existing atau imported di baris
   * lebih awal). Import dilakukan 2 pass: pass 1 insert tanpa parent, pass 2
   * update parent — supaya order baris di Excel tidak matter.
   */
  async importXlsx(buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.ctx.require().tenantId;
    const rows = await this.excel.parseBuffer(buffer, ['Kode', 'Nama', 'Jenis', 'Saldo Normal']);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const allowedKind = new Set(Object.values(AccountKind) as string[]);
    const allowedNb = new Set(Object.values(NormalBalance) as string[]);

    return this.tenancy.run(async (tx) => {
      // Existing accounts untuk resolve parent + dedup
      const existing = await tx.account.findMany({ select: { id: true, kode: true } });
      const byKode = new Map(existing.map((a) => [a.kode, a.id]));

      // Pass 1: create akun (skip parent dulu)
      const parentToResolve: Array<{ kode: string; parentKode: string; xlsRow: number }> = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const xlsRow = i + 2;
        const kode = String(row['Kode'] ?? '').trim();
        const nama = String(row['Nama'] ?? '').trim();
        const kindRaw = String(row['Jenis'] ?? '').trim().toUpperCase();
        const nbRaw = String(row['Saldo Normal'] ?? '').trim().toUpperCase();

        if (!kode || !nama) {
          result.errors.push({ row: xlsRow, message: 'Kode & Nama wajib diisi' });
          result.skipped++;
          continue;
        }
        if (!allowedKind.has(kindRaw)) {
          result.errors.push({ row: xlsRow, message: `Jenis "${kindRaw}" tidak valid` });
          result.skipped++;
          continue;
        }
        if (!allowedNb.has(nbRaw)) {
          result.errors.push({ row: xlsRow, message: `Saldo Normal "${nbRaw}" tidak valid (DEBIT/KREDIT)` });
          result.skipped++;
          continue;
        }
        if (byKode.has(kode)) {
          result.errors.push({ row: xlsRow, message: `Kode "${kode}" sudah ada` });
          result.skipped++;
          continue;
        }

        const parentKode = String(row['Parent'] ?? '').trim().split(/\s/)[0] ?? '';

        try {
          const created = await tx.account.create({
            data: {
              tenantId,
              kode, nama,
              kind: kindRaw as AccountKind,
              normalBalance: nbRaw as NormalBalance,
              isPostable: !['tidak', 'no', 'false', '0'].includes(
                String(row['Postable'] ?? 'Ya').toLowerCase().trim()),
              isActive: !['tidak', 'no', 'false', '0'].includes(
                String(row['Aktif'] ?? 'Ya').toLowerCase().trim()),
              saldoAwal: String(Number(row['Saldo Awal'] ?? 0)),
              catatan: String(row['Catatan'] ?? '').trim() || null,
            },
            select: { id: true, kode: true },
          });
          byKode.set(created.kode, created.id);
          if (parentKode) parentToResolve.push({ kode, parentKode, xlsRow });
          result.created++;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            result.errors.push({ row: xlsRow, message: `Kode "${kode}" sudah ada` });
          } else {
            result.errors.push({ row: xlsRow, message: e instanceof Error ? e.message : String(e) });
          }
          result.skipped++;
        }
      }

      // Pass 2: set parentId
      for (const { kode, parentKode, xlsRow } of parentToResolve) {
        const id = byKode.get(kode);
        const parentId = byKode.get(parentKode);
        if (!id) continue; // already errored above
        if (!parentId) {
          result.errors.push({ row: xlsRow, message: `Parent "${parentKode}" tidak ditemukan` });
          continue;
        }
        await tx.account.update({ where: { id }, data: { parentId } });
      }

      return result;
    });
  }

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.tenancy.run((tx) =>
      tx.account.findMany({
        orderBy: { kode: 'asc' },
        include: { parent: { select: { kode: true, nama: true } } },
      }),
    );
    return this.excel.buildBuffer(
      'COA',
      [
        { header: 'Kode', key: 'kode', width: 12, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 36, value: (r) => r.nama },
        { header: 'Jenis', key: 'kind', width: 18, value: (r) => r.kind },
        { header: 'Saldo Normal', key: 'normalBalance', width: 12,
          value: (r) => r.normalBalance },
        { header: 'Postable', key: 'isPostable', width: 10,
          value: (r) => (r.isPostable ? 'Ya' : 'Tidak') },
        { header: 'Parent', key: 'parent', width: 24,
          value: (r) => r.parent ? `${r.parent.kode} ${r.parent.nama}` : '' },
        { header: 'Saldo Awal', key: 'saldoAwal', width: 16, format: 'currency',
          value: (r) => r.saldoAwal },
        { header: 'Aktif', key: 'isActive', width: 8,
          value: (r) => (r.isActive ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }

  /** Daftar COA datar (untuk dropdown). */
  flat() {
    return this.tenancy.run((tx) =>
      tx.account.findMany({
        where: { isActive: true },
        orderBy: { kode: 'asc' },
        select: {
          id: true,
          kode: true,
          nama: true,
          kind: true,
          normalBalance: true,
          isPostable: true,
          parentId: true,
          saldoAwal: true,
        },
      }),
    );
  }

  /** COA dalam bentuk tree (untuk halaman Bagan Akun). */
  async tree() {
    const flat = await this.flat();
    type Node = (typeof flat)[number] & { children: Node[] };
    const byId = new Map<string, Node>();
    flat.forEach((a) => byId.set(a.id, { ...a, children: [] }));
    const roots: Node[] = [];
    for (const node of byId.values()) {
      if (node.parentId) {
        byId.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const a = await tx.account.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Akun tidak ditemukan');
      return a;
    });
  }

  /**
   * Update akun. Tidak menyentuh `kind`/`normalBalance` — keduanya akan
   * mengubah interpretasi historis di buku besar (sign apply).
   * Guard tambahan:
   *   - parentId baru harus existing akun di tenant ini dan bukan self/descendant.
   *   - isPostable=false hanya diizinkan kalau akun belum punya journal_lines.
   *   - kode baru wajib unik dalam tenant.
   */
  async update(id: string, input: UpdateAccountInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const existing = await tx.account.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Akun tidak ditemukan');

      // Unik kode per tenant — kalau berubah, cek tabrakan.
      if (input.kode !== existing.kode) {
        const dup = await tx.account.findFirst({
          where: { tenantId, kode: input.kode, NOT: { id } },
          select: { id: true },
        });
        if (dup) throw new BadRequestException(`Kode "${input.kode}" sudah dipakai`);
      }

      // parentId boleh null (jadi root). Validasi: tidak menunjuk diri sendiri atau descendant.
      if (input.parentId) {
        if (input.parentId === id) {
          throw new BadRequestException('Parent tidak boleh akun itu sendiri');
        }
        const parent = await tx.account.findUnique({ where: { id: input.parentId } });
        if (!parent) throw new BadRequestException('Parent tidak ditemukan');
        // Cek descendant: walk dari parent ke atas; kalau ketemu id ini → siklus.
        let cur: typeof parent | null = parent;
        while (cur?.parentId) {
          if (cur.parentId === id) {
            throw new BadRequestException('Parent membentuk siklus');
          }
          cur = await tx.account.findUnique({ where: { id: cur.parentId } });
        }
      }

      // saldoAwal akun subsidiary (Piutang/Utang/Persediaan) tidak boleh
      // di-edit lump-sum di sini — harus lewat prosedur Saldo Awal
      // Terintegrasi (Pengaturan › Saldo Awal), supaya selalu derived dari
      // subsidiary detail (per customer/vendor/item) dan tidak mismatch
      // seperti sebelumnya (lihat EVALUASI.md). KECUALI: target PERSIS 0 —
      // itu jalur sah untuk "discharge" saldo lama (legacy/migrasi) yang
      // sudah direkonsiliasi manual, supaya OpeningBalanceService.post() tidak
      // diam-diam membuang nilai itu tanpa jurnal (lihat guard di post()).
      const targetIsZero = new Decimal(input.saldoAwal).eq(0);
      if (!targetIsZero && !new Decimal(existing.saldoAwal).eq(new Decimal(input.saldoAwal))) {
        for (const key of SALDO_AWAL_SUBSIDIARY_KEYS) {
          let resolvedId: string | null = null;
          try {
            resolvedId = await this.glConfig.getAccountIdInTx(tx, key);
          } catch {
            continue; // akun default belum ada / belum di-provision — tidak relevan
          }
          if (resolvedId === id) {
            throw new BadRequestException(
              `Saldo awal akun ini (${SALDO_AWAL_SUBSIDIARY_LABEL[key]}) dikelola lewat ` +
              'prosedur Saldo Awal Terintegrasi di Pengaturan › Saldo Awal, bukan di sini.',
            );
          }
        }
      }

      // isPostable=false hanya jika belum pernah dipakai di journal_lines.
      if (existing.isPostable && !input.isPostable) {
        const used = await tx.journalLine.findFirst({
          where: { accountId: id }, select: { id: true },
        });
        if (used) {
          throw new BadRequestException(
            'Akun sudah dipakai di jurnal — tidak bisa diubah jadi non-postable',
          );
        }
      }

      return tx.account.update({
        where: { id },
        data: {
          kode: input.kode,
          nama: input.nama,
          parentId: input.parentId ?? null,
          isPostable: input.isPostable,
          isActive: input.isActive,
          saldoAwal: input.saldoAwal,
          catatan: input.catatan ?? null,
        },
      });
    });
  }
}
