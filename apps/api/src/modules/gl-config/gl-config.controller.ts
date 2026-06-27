import {
  Body, Controller, Get, Param, Put, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';

const upsertSchema = z.object({
  accountId: z.string().uuid().nullable(),
});

@Controller('gl-config')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class GlConfigController {
  constructor(private readonly glConfig: GlConfigService) {}

  @Get()
  list() {
    return this.glConfig.list();
  }

  @Put(':key')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  upsert(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(upsertSchema)) body: { accountId: string | null },
  ) {
    return this.glConfig.upsert(key, body.accountId);
  }
}
