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
import { z } from 'zod';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApprovalService } from './approval.service.js';

const DOC = z.enum(['PENJUALAN', 'PEMBELIAN', 'KAS_BANK', 'JURNAL']);
const ROLE = z.enum(['OWNER', 'ADMIN', 'AKUNTAN', 'KASIR', 'AUDITOR']);

const upsertRuleSchema = z.object({
  docType: DOC,
  minAmount: z.union([z.number(), z.string()]).transform((v) => String(v)),
  isActive: z.boolean().optional(),
  catatan: z.string().max(500).optional(),
  steps: z.array(ROLE).min(1).max(5),
});
type UpsertRuleInput = z.infer<typeof upsertRuleSchema>;

const submitSchema = z.object({ docType: DOC, docId: z.string().uuid() });
type SubmitInput = z.infer<typeof submitSchema>;

const actSchema = z.object({
  action: z.enum(['SETUJU', 'TOLAK']),
  catatan: z.string().max(500).optional(),
});
type ActInput = z.infer<typeof actSchema>;

@Controller('approval')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class ApprovalController {
  constructor(private readonly svc: ApprovalService) {}

  @Get('rules')
  listRules() {
    return this.svc.listRules();
  }

  @Get('inbox')
  inbox() {
    return this.svc.inbox();
  }

  @Get('status')
  status(@Query('docType') docType: string, @Query('docId') docId: string) {
    return this.svc.statusForDoc(DOC.parse(docType), docId);
  }

  @Post('rules')
  @Roles('OWNER', 'ADMIN')
  create(@Body(new ZodValidationPipe(upsertRuleSchema)) body: UpsertRuleInput) {
    return this.svc.upsertRule(null, body);
  }

  @Patch('rules/:id')
  @Roles('OWNER', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertRuleSchema)) body: UpsertRuleInput,
  ) {
    return this.svc.upsertRule(id, body);
  }

  @Delete('rules/:id')
  @Roles('OWNER', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.svc.deleteRule(id);
  }

  @Post('submit')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  submit(@Body(new ZodValidationPipe(submitSchema)) body: SubmitInput) {
    return this.svc.submit(body.docType, body.docId);
  }

  @Post(':id/act')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  act(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(actSchema)) body: ActInput,
  ) {
    return this.svc.act(id, body.action, body.catatan);
  }
}
