import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  bulkFiskalAttributeSchema,
  createKoreksiFiskalSchema,
  kompensasiSchema,
  pphSettingSchema,
  updateKoreksiFiskalSchema,
  type BulkFiskalAttributeInput,
  type CreateKoreksiFiskalInput,
  type KompensasiInput,
  type PphSettingInput,
  type UpdateKoreksiFiskalInput,
} from '@lentera/shared/schemas';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { FiskalService } from './fiskal.service.js';

@Controller('fiskal')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class FiskalController {
  constructor(private readonly fiskal: FiskalService) {}

  /** Akun beban/pendapatan + atribut fiskal (page Pengaturan › Atribut Fiskal). */
  @Get('akun-attributes')
  listAkunAttributes() {
    return this.fiskal.listAkunAttributes();
  }

  /** Set atribut fiskal beberapa akun sekaligus. */
  @Patch('akun-attributes')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  bulkSetAkunAttributes(
    @Body(new ZodValidationPipe(bulkFiskalAttributeSchema)) body: BulkFiskalAttributeInput,
  ) {
    return this.fiskal.bulkSetAkunAttributes(body);
  }

  // ---------- Parameter PPh Badan ----------

  @Get('pph-setting')
  getPphSetting(@Query('fiscalYearId') fiscalYearId: string) {
    return this.fiskal.getPphSetting(fiscalYearId);
  }

  @Put('pph-setting')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  upsertPphSetting(
    @Body(new ZodValidationPipe(pphSettingSchema)) body: PphSettingInput,
  ) {
    return this.fiskal.upsertPphSetting(body);
  }

  // ---------- Kompensasi kerugian ----------

  @Get('kompensasi')
  getKompensasi(@Query('fiscalYearId') fiscalYearId: string) {
    return this.fiskal.getKompensasi(fiscalYearId);
  }

  @Put('kompensasi')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  upsertKompensasi(
    @Body(new ZodValidationPipe(kompensasiSchema)) body: KompensasiInput,
  ) {
    return this.fiskal.upsertKompensasi(body);
  }

  // ---------- Penyusutan fiskal vs komersial ----------

  @Get('penyusutan')
  penyusutanTahun(@Query('fiscalYearId') fiscalYearId: string) {
    return this.fiskal.penyusutanTahun(fiscalYearId);
  }

  // ---------- Koreksi fiskal manual ----------

  @Get('koreksi')
  listKoreksi(@Query('fiscalYearId') fiscalYearId: string) {
    return this.fiskal.listKoreksi(fiscalYearId);
  }

  @Post('koreksi')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  createKoreksi(
    @Body(new ZodValidationPipe(createKoreksiFiskalSchema)) body: CreateKoreksiFiskalInput,
  ) {
    return this.fiskal.createKoreksi(body);
  }

  @Patch('koreksi/:id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  updateKoreksi(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateKoreksiFiskalSchema.omit({ id: true }).partial()))
    body: Omit<UpdateKoreksiFiskalInput, 'id'>,
  ) {
    return this.fiskal.updateKoreksi({ ...body, id });
  }

  @Delete('koreksi/:id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteKoreksi(@Param('id') id: string) {
    return this.fiskal.deleteKoreksi(id);
  }

  // ---------- Worksheet rekonsiliasi fiskal ----------

  @Get('rekonsiliasi')
  rekonsiliasi(@Query('fiscalYearId') fiscalYearId: string) {
    return this.fiskal.build(fiscalYearId);
  }
}
