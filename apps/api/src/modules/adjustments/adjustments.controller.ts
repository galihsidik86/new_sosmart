import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
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
  createStokAdjustmentInputSchema,
  type CancelInvoiceInput,
  type CreateStokAdjustmentInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdjustmentsService } from './adjustments.service.js';
import type { InvoiceStatus } from '@lentera/db';

@Controller('stok-adjustments')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class AdjustmentsController {
  constructor(private readonly adj: AdjustmentsService) {}

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: InvoiceStatus,
    @Query('cabangId') cabangId?: string,
  ) {
    sendXlsx(reply, 'penyesuaian-stok.xlsx', await this.adj.exportXlsx({ status, cabangId }));
  }

  @Get()
  list(
    @Query('status') status?: InvoiceStatus,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.adj.list({ status, cabangId });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.adj.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createStokAdjustmentInputSchema))
    body: CreateStokAdjustmentInput,
  ) {
    return this.adj.createDraft(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createStokAdjustmentInputSchema))
    body: CreateStokAdjustmentInput,
  ) {
    return this.adj.updateDraft(id, body);
  }

  @Post(':id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  post(
    @Param('id') id: string,
    @Headers('x-requested-by-user-id') requestedById?: string,
  ) {
    return this.adj.post(id, requestedById);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.adj.cancel(id, body.alasan);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.adj.deleteDraft(id);
  }
}
