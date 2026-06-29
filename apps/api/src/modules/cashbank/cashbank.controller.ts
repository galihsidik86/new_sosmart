import {
  Body,
  Controller,
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
  createCashBankInputSchema,
  type CancelInvoiceInput,
  type CreateCashBankInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CashBankService } from './cashbank.service.js';
import type { CashBankType, InvoiceStatus } from '@lentera/db';

@Controller('cash-bank')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class CashBankController {
  constructor(private readonly cb: CashBankService) {}

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: InvoiceStatus,
    @Query('tipe') tipe?: CashBankType,
    @Query('periodId') periodId?: string,
  ) {
    sendXlsx(reply, 'kas-bank.xlsx', await this.cb.exportXlsx({ status, tipe, periodId }));
  }

  @Get()
  list(
    @Query('status') status?: InvoiceStatus,
    @Query('tipe') tipe?: CashBankType,
    @Query('periodId') periodId?: string,
  ) {
    return this.cb.list({ status, tipe, periodId });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.cb.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  create(
    @Body(new ZodValidationPipe(createCashBankInputSchema))
    body: CreateCashBankInput,
  ) {
    return this.cb.createDraft(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCashBankInputSchema))
    body: CreateCashBankInput,
  ) {
    return this.cb.updateDraft(id, body);
  }

  @Post(':id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  post(@Param('id') id: string) {
    return this.cb.post(id);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
    @Headers('x-requested-by-user-id') requestedById?: string,
  ) {
    return this.cb.cancel(id, body.alasan, requestedById);
  }
}
