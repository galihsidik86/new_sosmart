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
import { type ReplyLike, sendXlsx, sendPdf } from '../../common/http/reply.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { SalesPdfService } from './sales-pdf.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  cancelInvoiceInputSchema,
  createSalesInvoiceInputSchema,
  type CancelInvoiceInput,
  type CreateSalesInvoiceInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SalesService } from './sales.service.js';
import type { InvoiceStatus } from '@lentera/db';

@Controller('sales-invoices')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly salesPdf: SalesPdfService,
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
    @Query('customerId') customerId?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.sales.list({ status, customerId, periodId });
  }

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: InvoiceStatus,
    @Query('customerId') customerId?: string,
    @Query('periodId') periodId?: string,
  ) {
    sendXlsx(reply, 'penjualan.xlsx',
      await this.sales.exportXlsx({ status, customerId, periodId }));
  }

  @Get(':id/print.pdf')
  async printPdf(@Res() reply: ReplyLike, @Param('id') id: string) {
    const [inv, nama] = await Promise.all([
      this.sales.byId(id),
      this.tenantNama(),
    ]);
    sendPdf(reply, `faktur-${inv.nomor ?? 'draft'}.pdf`,
      await this.salesPdf.build(inv, nama));
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.sales.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  create(
    @Body(new ZodValidationPipe(createSalesInvoiceInputSchema))
    body: CreateSalesInvoiceInput,
  ) {
    return this.sales.createDraft(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createSalesInvoiceInputSchema))
    body: CreateSalesInvoiceInput,
  ) {
    return this.sales.updateDraft(id, body);
  }

  @Post(':id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  post(
    @Param('id') id: string,
    @Headers('x-requested-by-user-id') requestedById?: string,
    @Body() body?: { overrideBudget?: boolean; alasan?: string },
  ) {
    return this.sales.post(id, requestedById, {
      overrideBudget: !!body?.overrideBudget,
      alasan: body?.alasan,
    });
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
    @Headers('x-requested-by-user-id') requestedById?: string,
  ) {
    return this.sales.cancel(id, body.alasan, requestedById);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.sales.deleteDraft(id);
  }
}
