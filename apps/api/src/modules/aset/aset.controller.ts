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
  createAsetInputSchema,
  disposeAsetInputSchema,
  type CancelInvoiceInput,
  type CreateAsetInput,
  type DisposeAsetInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AsetService } from './aset.service.js';
import type { AsetStatus } from '@lentera/db';

@Controller('aset')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class AsetController {
  constructor(private readonly aset: AsetService) {}

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('status') status?: AsetStatus,
    @Query('cabangId') cabangId?: string,
  ) {
    sendXlsx(reply, 'aset-tetap.xlsx', await this.aset.exportXlsx({ status, cabangId }));
  }

  @Get()
  list(
    @Query('status') status?: AsetStatus,
    @Query('cabangId') cabangId?: string,
  ) {
    return this.aset.list({ status, cabangId });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.aset.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createAsetInputSchema)) body: CreateAsetInput,
  ) {
    return this.aset.create(body);
  }

  @Post(':id/dispose')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  dispose(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disposeAsetInputSchema)) body: DisposeAsetInput,
  ) {
    return this.aset.dispose(id, body);
  }

  @Post(':id/undispose')
  @Roles('OWNER', 'ADMIN')
  undispose(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
  ) {
    return this.aset.undispose(id, body.alasan);
  }
}
