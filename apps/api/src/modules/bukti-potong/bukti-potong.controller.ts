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
  createBuktiPotongManualInputSchema,
  type CancelInvoiceInput,
  type CreateBuktiPotongManualInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { BuktiPotongService } from './bukti-potong.service.js';
import type { BuktiPotongStatus, JenisPph } from '@lentera/db';

@Controller('bukti-potong')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class BuktiPotongController {
  constructor(private readonly bp: BuktiPotongService) {}

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('jenisPph') jenisPph?: JenisPph,
    @Query('status') status?: BuktiPotongStatus,
    @Query('periodId') periodId?: string,
  ) {
    sendXlsx(reply, 'bukti-potong.xlsx', await this.bp.exportXlsx({ jenisPph, status, periodId }));
  }

  @Get()
  list(
    @Query('jenisPph') jenisPph?: JenisPph,
    @Query('status') status?: BuktiPotongStatus,
    @Query('periodId') periodId?: string,
  ) {
    return this.bp.list({ jenisPph, status, periodId });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.bp.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createBuktiPotongManualInputSchema))
    body: CreateBuktiPotongManualInput,
  ) {
    return this.bp.createManual(body);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.bp.cancel(id, body.alasan);
  }
}
