import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';

const createSchema = z.object({
  akunId: z.string().uuid(),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  saldoRekeningKoran: z.union([z.number(), z.string()]).transform((v) => String(v)),
  catatan: z.string().max(500).optional(),
});
type CreateInput = z.infer<typeof createSchema>;

const toggleSchema = z.object({
  journalLineId: z.string().uuid(),
  cleared: z.boolean(),
});
type ToggleInput = z.infer<typeof toggleSchema>;

const finalizeSchema = z.object({ catatan: z.string().max(500).optional() }).default({});
type FinalizeInput = z.infer<typeof finalizeSchema>;

@Controller('bank-reconciliation')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class BankReconciliationController {
  constructor(private readonly svc: BankReconciliationService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get('akun-kas-bank')
  akunKasBank() {
    return this.svc.akunKasBank();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.svc.create(body);
  }

  @Post(':id/toggle')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  toggle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(toggleSchema)) body: ToggleInput,
  ) {
    return this.svc.toggle(id, body.journalLineId, body.cleared);
  }

  @Post(':id/finalize')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  finalize(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(finalizeSchema)) body: FinalizeInput,
  ) {
    return this.svc.finalize(id, body.catatan);
  }

  @Post(':id/reopen')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  reopen(@Param('id') id: string) {
    return this.svc.reopen(id);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
