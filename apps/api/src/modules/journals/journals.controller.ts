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
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
import {
  createJournalInputSchema,
  reverseJournalInputSchema,
  type CreateJournalInput,
  type ReverseJournalInput,
} from '@lentera/shared/schemas';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JournalsService } from './journals.service.js';
import type { JournalStatus, JournalSource } from '@lentera/db';

@Controller('journals')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class JournalsController {
  constructor(private readonly journals: JournalsService) {}

  @Get()
  list(
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('status') status?: JournalStatus,
    @Query('sumber') sumber?: JournalSource,
    @Query('search') search?: string,
  ) {
    return this.journals.list({ periodId, cabangId, status, sumber, search });
  }

  @Get('export.xlsx')
  async exportXlsx(
    @Res() reply: ReplyLike,
    @Query('periodId') periodId?: string,
    @Query('cabangId') cabangId?: string,
    @Query('status') status?: JournalStatus,
    @Query('sumber') sumber?: JournalSource,
    @Query('search') search?: string,
  ) {
    sendXlsx(reply, 'jurnal.xlsx',
      await this.journals.exportXlsx({ periodId, cabangId, status, sumber, search }));
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.journals.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  create(
    @Body(new ZodValidationPipe(createJournalInputSchema))
    body: CreateJournalInput,
  ) {
    return this.journals.createDraft(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createJournalInputSchema))
    body: CreateJournalInput,
  ) {
    return this.journals.updateDraft(id, body);
  }

  @Post(':id/post')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  post(@Param('id') id: string) {
    return this.journals.post(id);
  }

  @Post(':id/reverse')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  reverse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reverseJournalInputSchema.partial({ journalId: true })))
    body: Omit<ReverseJournalInput, 'journalId'>,
  ) {
    return this.journals.reverse(id, {
      tanggal: body.tanggal ? new Date(body.tanggal + 'T00:00:00.000Z') : undefined,
      alasan: body.alasan,
    });
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  deleteDraft(@Param('id') id: string) {
    return this.journals.deleteDraft(id);
  }
}
