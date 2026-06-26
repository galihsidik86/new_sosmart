import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type ReplyLike, sendXlsx, sendPdf } from '../../common/http/reply.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { PurchasePdfService } from './purchase-pdf.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  cancelInvoiceInputSchema,
  createPurchaseInvoiceInputSchema,
  type CancelInvoiceInput,
  type CreatePurchaseInvoiceInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PurchasesService } from './purchases.service.js';
import type { InvoiceStatus } from '@lentera/db';

@Controller('purchase-invoices')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly purchPdf: PurchasePdfService,
    private readonly tenancy: TenancyService,
  ) {}

  private async tenantNama(): Promise<string> {
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ select: { nama: true } }),
    );
    return t?.nama ?? 'Tenant';
  }

  @Get()
  list(
    @Query('status') status?: InvoiceStatus,
    @Query('vendorId') vendorId?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.purchases.list({ status, vendorId, periodId });
  }

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: InvoiceStatus,
    @Query('vendorId') vendorId?: string,
    @Query('periodId') periodId?: string,
  ) {
    sendXlsx(reply, 'pembelian.xlsx',
      await this.purchases.exportXlsx({ status, vendorId, periodId }));
  }

  @Get(':id/print.pdf')
  async printPdf(@Res() reply: ReplyLike, @Param('id') id: string) {
    const [inv, nama] = await Promise.all([
      this.purchases.byId(id),
      this.tenantNama(),
    ]);
    sendPdf(reply, `tagihan-${inv.nomor ?? 'draft'}.pdf`,
      await this.purchPdf.build(inv, nama));
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.purchases.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createPurchaseInvoiceInputSchema))
    body: CreatePurchaseInvoiceInput,
  ) {
    return this.purchases.createDraft(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPurchaseInvoiceInputSchema))
    body: CreatePurchaseInvoiceInput,
  ) {
    return this.purchases.updateDraft(id, body);
  }

  @Post(':id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  post(@Param('id') id: string) {
    return this.purchases.post(id);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.purchases.cancel(id, body.alasan);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.purchases.deleteDraft(id);
  }
}
