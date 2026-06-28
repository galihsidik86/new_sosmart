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
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
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
  ) {}

  private async tenantNama(): Promise<string> {
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ select: { nama: true } }),
    );
    return t?.nama ?? 'Tenant';
  }

  /** Buku besar per akun per periode (default: periode aktif pertama). */
  @Get('ledger')
  buku(
    @Query('accountId') accountId: string,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.ledger.buku({ accountId, periodId, cabangId });
  }

  /** Neraca saldo per periode (semua akun postable). */
  @Get('trial-balance')
  trialBalance(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('hideZero') hideZero?: string,
  ) {
    return this.tb.build({
      periodId,
      cabangId,
      hideZero: hideZero === 'true',
    });
  }

  @Get('trial-balance.xlsx')
  async trialBalanceXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('hideZero') hideZero?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.tb.build({ periodId, cabangId, hideZero: hideZero === 'true' }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'neraca-saldo.xlsx', await this.xlsx.buildTrialBalance(data, nama));
  }
}
