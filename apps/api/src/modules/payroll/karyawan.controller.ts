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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createKaryawanInputSchema,
  type CreateKaryawanInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { KaryawanService } from './karyawan.service.js';

@Controller('karyawan')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class KaryawanController {
  constructor(private readonly karyawan: KaryawanService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('cabangId') cabangId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.karyawan.list({
      search, cabangId,
      isActive: isActive !== 'false',
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.karyawan.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createKaryawanInputSchema)) body: CreateKaryawanInput,
  ) {
    return this.karyawan.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createKaryawanInputSchema.partial()))
    body: Partial<CreateKaryawanInput>,
  ) {
    return this.karyawan.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Param('id') id: string) {
    return this.karyawan.deactivate(id);
  }
}
