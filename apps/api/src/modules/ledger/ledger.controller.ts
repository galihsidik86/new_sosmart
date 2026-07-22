import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
import { normalizeProjectFilter } from '../../common/http/query.js';
import { LedgerService } from './ledger.service.js';
import { TrialBalanceService } from './trial-balance.service.js';
import { ReportsExcelService } from '../reports/reports-excel.service.js';

@Controller()
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly tb: TrialBalanceService,
    private readonly xlsx: ReportsExcelService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  private async tenantNama(): Promise<string> {
    // Scope ke tenant aktif: RLS tenants_select mengizinkan user melihat semua
    // tenant tempat ia jadi anggota, jadi findFirst polos bisa salah tenant.
    const tenantId = this.ctx.require().tenantId;
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { nama: true } }),
    );
    return t?.nama ?? 'Tenant';
  }

  /** Buku besar per akun per periode (default: periode aktif pertama). */
  @Get('ledger')
  buku(
    @Query('accountId') accountId: string,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.ledger.buku({
      accountId,
      periodId,
      cabangId,
      projectId: normalizeProjectFilter(projectId),
    });
  }

  @Get('ledger.xlsx')
  async bukuXlsx(
    @Res() reply: ReplyLike,
    @Query('accountId') accountId: string,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('projectId') projectId?: string,
  ) {
    sendXlsx(
      reply,
      'buku-besar.xlsx',
      await this.ledger.exportBukuXlsx({
        accountId,
        periodId,
        cabangId,
        projectId: normalizeProjectFilter(projectId),
      }),
    );
  }

  /** Neraca saldo per periode (semua akun postable). */
  @Get('trial-balance')
  trialBalance(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('hideZero') hideZero?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tb.build({
      periodId,
      cabangId,
      hideZero: hideZero === 'true',
      projectId: normalizeProjectFilter(projectId),
    });
  }

  @Get('trial-balance.xlsx')
  async trialBalanceXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('hideZero') hideZero?: string,
    @Query('projectId') projectId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.tb.build({
        periodId,
        cabangId,
        hideZero: hideZero === 'true',
        projectId: normalizeProjectFilter(projectId),
      }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'neraca-saldo.xlsx', await this.xlsx.buildTrialBalance(data, nama));
  }
}
