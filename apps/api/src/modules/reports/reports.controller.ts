import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { LabaRugiService } from './laba-rugi.service.js';
import { NeracaService } from './neraca.service.js';
import { ArusKasService } from './arus-kas.service.js';
import { PerubahanEkuitasService } from './perubahan-ekuitas.service.js';

@Controller('reports')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class ReportsController {
  constructor(
    private readonly lr: LabaRugiService,
    private readonly nrc: NeracaService,
    private readonly ak: ArusKasService,
    private readonly pe: PerubahanEkuitasService,
  ) {}

  @Get('laba-rugi')
  labaRugi(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    return this.lr.build({ periodId, cabangId, ytd: ytd === 'true' });
  }

  @Get('neraca')
  neraca(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.nrc.build({ periodId, cabangId });
  }

  @Get('arus-kas')
  arusKas(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    return this.ak.build({ periodId, cabangId, ytd: ytd !== 'false' });
  }

  @Get('perubahan-ekuitas')
  perubahanEkuitas(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    return this.pe.build({ periodId, cabangId, ytd: ytd !== 'false' });
  }
}
