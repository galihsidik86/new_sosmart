import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @Query('status') status?: InvoiceStatus,
    @Query('customerId') customerId?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.sales.list({ status, customerId, periodId });
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
  post(@Param('id') id: string) {
    return this.sales.post(id);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.sales.cancel(id, body.alasan);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.sales.deleteDraft(id);
  }
}
