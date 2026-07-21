import { Controller, Get, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { type ReplyLike, sendPdf, sendXlsx } from '../../common/http/reply.js';
import { normalizeProjectFilter } from '../../common/http/query.js';
import { readLogoDataUri } from '../../common/pdf/logo.js';
import { LabaRugiService } from './laba-rugi.service.js';
import { NeracaService } from './neraca.service.js';
import { ArusKasService } from './arus-kas.service.js';
import { PerubahanEkuitasService } from './perubahan-ekuitas.service.js';
import { BudgetActualService } from './budget-actual.service.js';
import { ReportsPdfService } from './reports-pdf.service.js';
import { ReportsExcelService } from './reports-excel.service.js';
import { ArAgingService } from './ar-aging.service.js';
import { ApAgingService } from './ap-aging.service.js';
import { LabaRugiProyekService } from './laba-rugi-proyek.service.js';
import { JejakAuditService } from './jejak-audit.service.js';
import type { JournalSource } from '@lentera/db';

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
    private readonly ar: ArAgingService,
    private readonly ap: ApAgingService,
    private readonly lrp: LabaRugiProyekService,
    private readonly audit: JejakAuditService,
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

  /** Nama tenant + logo (data URI) untuk header cetak PDF. */
  private async brand(): Promise<{ nama: string; logo: string | null }> {
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ select: { nama: true, logoUrl: true } }),
    );
    const logo = await readLogoDataUri(t?.logoUrl);
    return { nama: t?.nama ?? 'Tenant', logo };
  }

  @Get('laba-rugi')
  labaRugi(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
    @Query('vertikal') vertikal?: string,
    @Query('compareToPeriodId') compareToPeriodId?: string,
  ) {
    return this.lr.build({
      periodId,
      cabangId,
      ytd: ytd === 'true',
      projectId: normalizeProjectFilter(projectId),
      vertikal: vertikal === 'true',
      compareToPeriodId: compareToPeriodId || undefined,
    });
  }

  @Get('neraca')
  neraca(
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
    @Query('vertikal') vertikal?: string,
    @Query('compareToPeriodId') compareToPeriodId?: string,
  ) {
    return this.nrc.build({
      periodId,
      cabangId,
      vertikal: vertikal === 'true',
      compareToPeriodId: compareToPeriodId || undefined,
    });
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

  @Get('arus-kas-detail')
  arusKasDetail(
    @Query('periodId') periodId: string,
    @Query('granularity') granularity?: string,
    @Query('cabangId') cabangId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.ak.buildDetail({
      periodId,
      granularity: granularity === 'harian' ? 'harian' : 'bulanan',
      cabangId,
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
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('industriId') industriId?: string,
    @Query('jenisProjekId') jenisProjekId?: string,
  ) {
    return this.ba.build({ periode, ytd: ytd === 'true', projectId, cabangId, industriId, jenisProjekId });
  }

  // --------------- Laba Rugi per Proyek (batch semua proyek) ---------------

  @Get('laba-rugi-proyek')
  labaRugiProyek(
    @Query('periodId') periodId: string,
    @Query('ytd') ytd?: string,
    @Query('cabangId') cabangId?: string,
    @Query('industriId') industriId?: string,
    @Query('jenisProjekId') jenisProjekId?: string,
  ) {
    return this.lrp.build({ periodId, ytd: ytd === 'true', cabangId, industriId, jenisProjekId });
  }

  @Get('laba-rugi-proyek.pdf')
  async labaRugiProyekPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('ytd') ytd?: string,
    @Query('cabangId') cabangId?: string,
    @Query('industriId') industriId?: string,
    @Query('jenisProjekId') jenisProjekId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.lrp.build({ periodId, ytd: ytd === 'true', cabangId, industriId, jenisProjekId }),
      this.brand(),
    ]);
    sendPdf(reply, 'laba-rugi-proyek.pdf', await this.pdf.buildLabaRugiProyek(data, nama.nama, nama.logo));
  }

  // --------------- Jejak Audit (bukti transaksi bisa diklik) ---------------

  @Get('jejak-audit')
  jejakAudit(
    @Query('periodId') periodId?: string,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('sumber') sumber?: string,
    @Query('projectId') projectId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('search') search?: string,
    @Query('industriId') industriId?: string,
    @Query('jenisProjekId') jenisProjekId?: string,
  ) {
    return this.audit.build({
      periodId,
      dari,
      sampai,
      sumber: (sumber || undefined) as JournalSource | undefined,
      projectId: normalizeProjectFilter(projectId),
      industriId,
      jenisProjekId,
      cabangId,
      search,
    });
  }

  @Get('budget-actual.xlsx')
  async budgetActualXlsx(
    @Res() reply: ReplyLike,
    @Query('periode') periode: string,
    @Query('ytd') ytd?: string,
    @Query('projectId') projectId?: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ba.build({ periode, ytd: ytd === 'true', projectId, cabangId }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `budget-actual-${ytd === 'true' ? 'ytd-' : ''}${periode}.xlsx`,
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
      this.brand(),
    ]);
    sendPdf(reply, 'laba-rugi.pdf', await this.pdf.buildLabaRugi(data, nama.nama, nama.logo));
  }

  @Get('neraca.pdf')
  async neracaPdf(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.nrc.build({ periodId, cabangId }),
      this.brand(),
    ]);
    sendPdf(reply, 'neraca.pdf', await this.pdf.buildNeraca(data, nama.nama, nama.logo));
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
      this.brand(),
    ]);
    sendPdf(reply, 'arus-kas.pdf', await this.pdf.buildArusKas(data, nama.nama, nama.logo));
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
      this.brand(),
    ]);
    sendPdf(reply, 'perubahan-ekuitas.pdf', await this.pdf.buildPerubahanEkuitas(data, nama.nama, nama.logo));
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

  // --------------- AR / AP Aging (Fase G) ---------------

  @Get('ar-aging')
  arAging(
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
    @Query('jenisPelangganId') jenisPelangganId?: string,
  ) {
    return this.ar.build({ asOf, cabangId: cabangId || undefined, jenisPelangganId: jenisPelangganId || undefined });
  }

  @Get('ar-statement')
  arStatement(
    @Query('customerId') customerId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.ar.statement({ customerId, asOf, cabangId: cabangId || undefined });
  }

  @Get('ap-aging')
  apAging(
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.ap.build({ asOf, cabangId: cabangId || undefined });
  }

  @Get('ap-statement')
  apStatement(
    @Query('vendorId') vendorId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.ap.statement({ vendorId, asOf, cabangId: cabangId || undefined });
  }

  // --------------- AR / AP Aging PDF ---------------

  @Get('ar-aging.pdf')
  async arAgingPdf(
    @Res() reply: ReplyLike,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
    @Query('jenisPelangganId') jenisPelangganId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ar.build({ asOf, cabangId: cabangId || undefined, jenisPelangganId: jenisPelangganId || undefined }),
      this.brand(),
    ]);
    sendPdf(reply, `aging-piutang-${asOf}.pdf`, await this.pdf.buildArAging(data, nama.nama, nama.logo));
  }

  @Get('ar-statement.pdf')
  async arStatementPdf(
    @Res() reply: ReplyLike,
    @Query('customerId') customerId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ar.statement({ customerId, asOf, cabangId: cabangId || undefined }),
      this.brand(),
    ]);
    sendPdf(reply, `statement-piutang-${data.customer.kode}-${asOf}.pdf`, await this.pdf.buildArStatement(data, nama.nama, nama.logo));
  }

  @Get('ap-aging.pdf')
  async apAgingPdf(
    @Res() reply: ReplyLike,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ap.build({ asOf, cabangId: cabangId || undefined }),
      this.brand(),
    ]);
    sendPdf(reply, `aging-utang-${asOf}.pdf`, await this.pdf.buildApAging(data, nama.nama, nama.logo));
  }

  @Get('ap-statement.pdf')
  async apStatementPdf(
    @Res() reply: ReplyLike,
    @Query('vendorId') vendorId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ap.statement({ vendorId, asOf, cabangId: cabangId || undefined }),
      this.brand(),
    ]);
    sendPdf(reply, `statement-utang-${data.vendor.kode}-${asOf}.pdf`, await this.pdf.buildApStatement(data, nama.nama, nama.logo));
  }

  // --------------- AR / AP Aging Excel ---------------

  @Get('ar-aging.xlsx')
  async arAgingXlsx(
    @Res() reply: ReplyLike,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
    @Query('jenisPelangganId') jenisPelangganId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ar.build({ asOf, cabangId: cabangId || undefined, jenisPelangganId: jenisPelangganId || undefined }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `aging-piutang-${asOf}.xlsx`, await this.xlsx.buildArAging(data, nama));
  }

  @Get('ar-statement.xlsx')
  async arStatementXlsx(
    @Res() reply: ReplyLike,
    @Query('customerId') customerId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ar.statement({ customerId, asOf, cabangId: cabangId || undefined }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `statement-piutang-${data.customer.kode}-${asOf}.xlsx`, await this.xlsx.buildArStatement(data, nama));
  }

  @Get('ap-aging.xlsx')
  async apAgingXlsx(
    @Res() reply: ReplyLike,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ap.build({ asOf, cabangId: cabangId || undefined }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `aging-utang-${asOf}.xlsx`, await this.xlsx.buildApAging(data, nama));
  }

  @Get('ap-statement.xlsx')
  async apStatementXlsx(
    @Res() reply: ReplyLike,
    @Query('vendorId') vendorId: string,
    @Query('asOf') asOf: string,
    @Query('cabangId') cabangId?: string,
  ) {
    const [data, nama] = await Promise.all([
      this.ap.statement({ vendorId, asOf, cabangId: cabangId || undefined }),
      this.tenantNama(),
    ]);
    sendXlsx(reply, `statement-utang-${data.vendor.kode}-${asOf}.xlsx`, await this.xlsx.buildApStatement(data, nama));
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
