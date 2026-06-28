import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  cancelInvoiceInputSchema,
  createDepresiasiRunInputSchema,
  type CancelInvoiceInput,
  type CreateDepresiasiRunInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { DepresiasiService } from './depresiasi.service.js';

@Controller('depresiasi')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class DepresiasiController {
  constructor(private readonly dep: DepresiasiService) {}

  @Get('runs/export.xlsx')
  async exportXlsx(@Res() reply: ReplyLike) {
    sendXlsx(reply, 'penyusutan-bulanan.xlsx', await this.dep.exportXlsx());
  }

  @Get('runs')
  list() {
    return this.dep.list();
  }

  @Get('runs/:id')
  byId(@Param('id') id: string) {
    return this.dep.byId(id);
  }

  /** Preview tanpa post (dry run). */
  @Get('preview')
  preview(@Query('periode') periode: string) {
    return this.dep.preview(periode);
  }

  @Post('run')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  run(
    @Body(new ZodValidationPipe(createDepresiasiRunInputSchema))
    body: CreateDepresiasiRunInput,
  ) {
    return this.dep.runAndPost(
      body.periode,
      body.tanggal ? new Date(body.tanggal + 'T00:00:00Z') : undefined,
    );
  }

  @Post('runs/:id/cancel')
  @Roles('OWNER', 'ADMIN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.dep.cancel(id, body.alasan);
  }
}
