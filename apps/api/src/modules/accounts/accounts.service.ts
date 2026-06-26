import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateAccountInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

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
