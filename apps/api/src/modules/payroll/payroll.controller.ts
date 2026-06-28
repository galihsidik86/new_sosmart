import {
  Body,
  Controller,
  Delete,
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
  createPayrollRunInputSchema,
  type CancelInvoiceInput,
  type CreatePayrollRunInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PayrollService } from './payroll.service.js';
import type { InvoiceStatus } from '@lentera/db';

@Controller('payroll')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('runs/export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('cabangId') cabangId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    sendXlsx(reply, 'payroll.xlsx', await this.payroll.exportXlsx({ cabangId, status }));
  }

  @Get('runs')
  list(
    @Query('cabangId') cabangId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.payroll.list({ cabangId, status });
  }

  @Get('runs/:id')
  byId(@Param('id') id: string) {
    return this.payroll.byId(id);
  }

  @Get('preview')
  preview(
    @Query('cabangId') cabangId: string,
    @Query('periode') periode: string,
  ) {
    return this.payroll.preview({ cabangId, periode });
  }

  @Post('runs')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createPayrollRunInputSchema))
    body: CreatePayrollRunInput,
  ) {
    return this.payroll.createDraft(body);
  }

  @Post('runs/:id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  post(@Param('id') id: string) {
    return this.payroll.post(id);
  }

  @Post('runs/:id/cancel')
  @Roles('OWNER', 'ADMIN')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.payroll.cancel(id, body.alasan);
  }

  @Delete('runs/:id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.payroll.deleteDraft(id);
  }
}
