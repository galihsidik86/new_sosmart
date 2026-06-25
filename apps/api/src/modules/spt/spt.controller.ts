import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { SptPpnService } from './spt-ppn.service.js';
import { SptPphService } from './spt-pph.service.js';
import type { JenisPph } from '@lentera/db';

@Controller('spt')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class SptController {
  constructor(
    private readonly ppn: SptPpnService,
    private readonly pph: SptPphService,
  ) {}

  @Get('ppn')
  ppnMasa(@Query('periodId') periodId: string) {
    return this.ppn.build({ periodId });
  }

  @Get('pph')
  pphMasa(
    @Query('periodId') periodId: string,
    @Query('jenisPph') jenisPph: JenisPph,
  ) {
    return this.pph.build({ periodId, jenisPph });
  }
}
