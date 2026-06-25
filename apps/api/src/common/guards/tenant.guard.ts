import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TenancyService } from '../tenancy/tenancy.service.js';
import type { TenantCtx } from '../tenancy/tenant-context.js';

/**
 * TenantGuard
 *   1. Baca header `x-tenant-id` (atau `?tenant=` query).
 *   2. Verifikasi user punya Membership di tenant tsb.
 *      Pakai `runAsUser` — supaya RLS policy `memberships_select`
 *      (yang baca `app.user_id`) mengizinkan baris user ini.
 *   3. Lampirkan `req.tenantCtx` — TenancyInterceptor akan ambil dari sini
 *      dan wrap eksekusi handler ke AsyncLocalStorage.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenancy: TenancyService) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const req = execCtx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    if (!userId) throw new ForbiddenException('Tidak terautentikasi');

    const tenantId =
      (req.headers?.['x-tenant-id'] as string | undefined) ??
      (req.query?.tenant as string | undefined);
    if (!tenantId) {
      throw new ForbiddenException('Header x-tenant-id wajib di-set');
    }

    const membership = await this.tenancy.runAsUser(userId, (tx) =>
      tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        include: { cabang: true },
      }),
    );
    if (!membership) {
      throw new ForbiddenException('User bukan anggota tenant ini');
    }

    const allCabang = membership.cabang.length === 0;
    const cabangIds: string[] | null = allCabang
      ? null
      : membership.cabang.map((c) => c.cabangId);

    const cabangHeader = req.headers?.['x-cabang-id'] as string | undefined;
    if (cabangHeader && !allCabang && !cabangIds?.includes(cabangHeader)) {
      throw new ForbiddenException('User tidak punya akses ke cabang tsb');
    }

    const ctx: TenantCtx = {
      tenantId,
      userId,
      role: membership.role,
      cabangIds,
    };
    req.tenantCtx = ctx;
    return true;
  }
}
