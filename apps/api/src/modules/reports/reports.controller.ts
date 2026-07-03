import { Controller, Get, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { type ReplyLike, sendPdf, sendXlsx } from '../../common/http/reply.js';
import { normalizeProjectFilter } from '../../common/http/query.js';
import { LabaRugiService } from './laba-rugi.service.js';
import { NeracaService } from './neraca.service.js';
import { ArusKasService } from './arus-kas.service.js';
import { PerubahanEkuitasService } from './perubahan-ekuitas.service.js';
import { BudgetActualService } from './budget-actual.service.js';
import { ReportsPdfService } from './reports-pdf.service.js';
import { ReportsExcelService } from './reports-excel.service.js';

@Controller('reports')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class ReportsController {
  constructor(
    private readonly lr: LabaRugiService,
    private readonly nrc: NeracaService,
    private readonly ak: ArusKasService,
    private readonly pe: PerubahanEkuitasService,
    private readonly ba: BudgetActualService,
    private readonly pdf: ReportsPdfService,
    private readonly xlsx: ReportsExcelService,
    private readonly tenancy: TenancyService,
  ) {}

  private async tenantNama(): Promise<string> {
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ select: { nama: true } }),
    );
    return t?.nama ?? 'Tenant';
  }

  @Get('laba-rugi')
  labaRugi(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.lr.build({
      periodId,
      cabangId,
      ytd: ytd === 'true',
      projectId: normalizeProjectFilter(projectId),
    });
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
    @Query('projectId') projectId?: string,
  ) {
    return this.ak.build({
      periodId,
      cabangId,
      ytd: ytd !== 'false',
      projectId: normalizeProjectFilter(projectId),
    });
  }

  @Get('perubahan-ekuitas')
  perubahanEkuitas(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    return this.pe.build({ periodId, cabangId, ytd: ytd !== 'false' });
  }

  @Get('budget-actual')
  budgetActual(
    @Query('periode') periode: string,
    @Query('projectId') projectId?: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.ba.build({ periode, projectId, cabangId });
  }

  @Get('budget-actual.xlsx')
  async budgetActualXlsx(
    @Res() reply: ReplyLike,
    @Query('periode') periode: string,
    @Query('projectId') projectId?: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ba.build({ periode, projectId, cabangId }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `budget-actual-${periode}.xlsx`,
      await this.xlsx.buildBudgetActual(data, nama));
  }

  // --------------- PDF exports ---------------

  @Get('laba-rugi.pdf')
  async labaRugiPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.lr.build({
        periodId,
        cabangId,
        ytd: ytd === 'true',
        projectId: normalizeProjectFilter(projectId),
      }),
      this.tenantNama(),
    ]);
    sendPdf(reply, 'laba-rugi.pdf', await this.pdf.buildLabaRugi(data, nama));
  }

  @Get('neraca.pdf')
  async neracaPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.nrc.build({ periodId, cabangId }),
      this.tenantNama(),
    ]);
    sendPdf(reply, 'neraca.pdf', await this.pdf.buildNeraca(data, nama));
  }

  @Get('arus-kas.pdf')
  async arusKasPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ak.build({
        periodId,
        cabangId,
        ytd: ytd !== 'false',
        projectId: normalizeProjectFilter(projectId),
      }),
      this.tenantNama(),
    ]);
    sendPdf(reply, 'arus-kas.pdf', await this.pdf.buildArusKas(data, nama));
  }

  @Get('perubahan-ekuitas.pdf')
  async perubahanEkuitasPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.pe.build({ periodId, cabangId, ytd: ytd !== 'false' }),
      this.tenantNama(),
    ]);
    sendPdf(reply, 'perubahan-ekuitas.pdf', await this.pdf.buildPerubahanEkuitas(data, nama));
  }

  // --------------- Excel exports ---------------

  @Get('laba-rugi.xlsx')
  async labaRugiXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.lr.build({
        periodId,
        cabangId,
        ytd: ytd === 'true',
        projectId: normalizeProjectFilter(projectId),
      }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'laba-rugi.xlsx', await this.xlsx.buildLabaRugi(data, nama));
  }

  @Get('neraca.xlsx')
  async neracaXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.nrc.build({ periodId, cabangId }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'neraca.xlsx', await this.xlsx.buildNeraca(data, nama));
  }

  @Get('arus-kas.xlsx')
  async arusKasXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ak.build({
        periodId,
        cabangId,
        ytd: ytd !== 'false',
        projectId: normalizeProjectFilter(projectId),
      }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'arus-kas.xlsx', await this.xlsx.buildArusKas(data, nama));
  }

  @Get('perubahan-ekuitas.xlsx')
  async perubahanEkuitasXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.pe.build({ periodId, cabangId, ytd: ytd !== 'false' }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, 'perubahan-ekuitas.xlsx', await this.xlsx.buildPerubahanEkuitas(data, nama));
  }
}
