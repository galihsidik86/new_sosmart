import { Injectable } from '@nestjs/common';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';

@Injectable()
export class AccountsService {
  constructor(private readonly tenancy: TenancyService) {}

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
}
