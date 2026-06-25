import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  closePeriodInputSchema,
  reopenPeriodInputSchema,
  type ClosePeriodInput,
  type ReopenPeriodInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PeriodsService } from './periods.service.js';

@Controller('periods')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get('years')
  listYears() {
    return this.periods.listYears();
  }

  @Get('resolve')
  resolveByDate(@Query('date') date: string) {
    return this.periods.resolveByDate(new Date(date));
  }

  @Post('close')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  close(
    @Body(new ZodValidationPipe(closePeriodInputSchema)) body: ClosePeriodInput,
  ) {
    return this.periods.closePeriod(body.periodId, body.catatan);
  }

  @Post('reopen')
  @Roles('OWNER', 'ADMIN')
  reopen(
    @Body(new ZodValidationPipe(reopenPeriodInputSchema))
    body: ReopenPeriodInput,
  ) {
    return this.periods.reopenPeriod(body.periodId, body.alasan);
  }
}
