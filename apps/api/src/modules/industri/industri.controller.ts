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
import { IndustriService } from './industri.service.js';

const createSchema = z.object({
  kode: z.string().min(1).max(50),
  nama: z.string().min(2).max(200),
});
type CreateInput = z.infer<typeof createSchema>;

const updateSchema = z.object({
  nama: z.string().min(2).max(200).optional(),
  isAktif: z.boolean().optional(),
});
type UpdateInput = z.infer<typeof updateSchema>;

@Controller('industri')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class IndustriController {
  constructor(private readonly svc: IndustriService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list(includeInactive === 'true');
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.svc.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
