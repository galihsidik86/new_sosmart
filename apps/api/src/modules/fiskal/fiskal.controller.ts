import {
  Body, Controller, Get, Patch, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  bulkFiskalAttributeSchema,
  type BulkFiskalAttributeInput,
} from '@lentera/shared/schemas';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { FiskalService } from './fiskal.service.js';

@Controller('fiskal')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class FiskalController {
  constructor(private readonly fiskal: FiskalService) {}

  /** Akun beban/pendapatan + atribut fiskal (page Pengaturan › Atribut Fiskal). */
  @Get('akun-attributes')
  listAkunAttributes() {
    return this.fiskal.listAkunAttributes();
  }

  /** Set atribut fiskal beberapa akun sekaligus. */
  @Patch('akun-attributes')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  bulkSetAkunAttributes(
    @Body(new ZodValidationPipe(bulkFiskalAttributeSchema)) body: BulkFiskalAttributeInput,
  ) {
    return this.fiskal.bulkSetAkunAttributes(body);
  }
}
