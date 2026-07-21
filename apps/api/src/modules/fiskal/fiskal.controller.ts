import {
  Body, Controller, Get, Patch, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  bulkFiskalAttributeSchema,
  kompensasiSchema,
  pphSettingSchema,
  type BulkFiskalAttributeInput,
  type KompensasiInput,
  type PphSettingInput,
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
}
