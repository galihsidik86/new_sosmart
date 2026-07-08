import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  closeFiscalYearInputSchema,
  reopenFiscalYearInputSchema,
  type CloseFiscalYearInput,
  type ReopenFiscalYearInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { FiscalYearClosingService } from './fiscal-year-closing.service.js';

/**
 * Prefix sama ('periods') dengan PeriodsController (modul beda file supaya
 * FiscalYearClosingService bisa inject JournalsService tanpa circular
 * dependency — lihat komentar di fiscal-year-closing.service.ts).
 */
@Controller('periods')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class FiscalYearClosingController {
  constructor(private readonly closing: FiscalYearClosingService) {}

  @Post('close-year')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  closeYear(
    @Body(new ZodValidationPipe(closeFiscalYearInputSchema)) body: CloseFiscalYearInput,
  ) {
    return this.closing.closeFiscalYear(body.fiscalYearId, body.catatan);
  }

  @Post('reopen-year')
  @Roles('OWNER', 'ADMIN')
  reopenYear(
    @Body(new ZodValidationPipe(reopenFiscalYearInputSchema)) body: ReopenFiscalYearInput,
  ) {
    return this.closing.reopenFiscalYear(body.fiscalYearId, body.alasan);
  }
}
