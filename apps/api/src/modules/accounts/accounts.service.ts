import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateAccountInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

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
