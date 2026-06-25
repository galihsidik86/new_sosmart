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

  @Get()
  list(
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
    @Query('tipe') tipe?: string,
  ) {
    return this.customers.list({
      search,
      onlyActive: onlyActive !== 'false',
      tipe,
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
