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
import { type RequestWithFile, readXlsxUpload } from '../../common/http/multipart.js';
import { Req } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createCustomerInputSchema,
  type CreateCustomerInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('export.xlsx')
  async exportXlsx(@Res() reply: ReplyLike) {
    sendXlsx(reply, 'pelanggan.xlsx', await this.customers.exportXlsx());
  }

  @Post('import')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  async import(@Req() req: RequestWithFile) {
    const { buffer } = await readXlsxUpload(req);
    return this.customers.importXlsx(buffer);
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
    @Query('jenisPelangganId') jenisPelangganId?: string,
  ) {
    return this.customers.list({
      search,
      onlyActive: onlyActive !== 'false',
      jenisPelangganId,
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.customers.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN', 'KASIR')
  create(
    @Body(new ZodValidationPipe(createCustomerInputSchema))
    body: CreateCustomerInput,
  ) {
    return this.customers.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCustomerInputSchema.partial()))
    body: Partial<CreateCustomerInput>,
  ) {
    return this.customers.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Param('id') id: string) {
    return this.customers.deactivate(id);
  }
}
