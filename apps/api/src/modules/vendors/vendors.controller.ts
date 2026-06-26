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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createVendorInputSchema,
  type CreateVendorInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { VendorsService } from './vendors.service.js';

@Controller('vendors')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('export.xlsx')
  async exportXlsx(@Res() reply: ReplyLike) {
    sendXlsx(reply, 'vendor.xlsx', await this.vendors.exportXlsx());
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
    @Query('onlyPkp') onlyPkp?: string,
  ) {
    return this.vendors.list({
      search,
      onlyActive: onlyActive !== 'false',
      onlyPkp: onlyPkp === 'true',
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.vendors.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createVendorInputSchema)) body: CreateVendorInput,
  ) {
    return this.vendors.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createVendorInputSchema.partial()))
    body: Partial<CreateVendorInput>,
  ) {
    return this.vendors.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Param('id') id: string) {
    return this.vendors.deactivate(id);
  }
}
