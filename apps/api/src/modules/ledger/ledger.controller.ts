import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { LedgerService } from './ledger.service.js';
import { TrialBalanceService } from './trial-balance.service.js';

@Controller()
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly tb: TrialBalanceService,
  ) {}

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
}
