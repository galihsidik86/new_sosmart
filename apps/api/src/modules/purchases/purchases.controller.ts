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
import { readLogoDataUri } from '../../common/pdf/logo.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
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
    private readonly ctx: TenantContext,
  ) {}

  private async brand(): Promise<{ nama: string; logo: string | null }> {
    // Scope ke tenant aktif: RLS tenants_select mengizinkan user melihat semua
    // tenant tempat ia jadi anggota, jadi findFirst polos bisa salah tenant.
    const tenantId = this.ctx.require().tenantId;
    const t = await this.tenancy.run((tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { nama: true, logoUrl: true } }),
    );
    return { nama: t?.nama ?? 'Tenant', logo: await readLogoDataUri(t?.logoUrl) };
  }

  @Get()
  list(
    @Query('status') status?: InvoiceStatus,
    @Query('vendorId') vendorId?: string,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('industriId') industriId?: string,
  ) {
    return this.purchases.list({ status, vendorId, periodId, cabangId, projectId, search, industriId });
  }

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: InvoiceStatus,
    @Query('vendorId') vendorId?: string,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('industriId') industriId?: string,
  ) {
    sendXlsx(reply, 'pembelian.xlsx',
      await this.purchases.exportXlsx({ status, vendorId, periodId, cabangId, projectId, search, industriId }));
  }

  @Get(':id/print.pdf')
  async printPdf(@Res() reply: ReplyLike, @Param('id') id: string) {
    const [inv, brand] = await Promise.all([
      this.purchases.byId(id),
      this.brand(),
    ]);
    sendPdf(reply, `tagihan-${inv.nomor ?? 'draft'}.pdf`,
      await this.purchPdf.build(inv, brand.nama, brand.logo));
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
  post(
    @Param('id') id: string,
    @Headers('x-requested-by-user-id') requestedById?: string,
    @Body() body?: { overrideBudget?: boolean; alasan?: string },
  ) {
    return this.purchases.post(id, requestedById, {
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
    return this.purchases.cancel(id, body.alasan, requestedById);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.purchases.deleteDraft(id);
  }
}
