import { Injectable } from '@nestjs/common';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';

@Injectable()
export class TenantsService {
  constructor(private readonly tenancy: TenancyService) {}

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
}
