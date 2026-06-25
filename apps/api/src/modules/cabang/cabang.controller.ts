import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createCabangInputSchema,
  type CreateCabangInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CabangService } from './cabang.service.js';

@Controller('cabang')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class CabangController {
  constructor(private readonly cabang: CabangService) {}

  @Get()
  list() {
    return this.cabang.list();
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @Body(new ZodValidationPipe(createCabangInputSchema)) body: CreateCabangInput,
  ) {
    return this.cabang.create(body);
  }
}
