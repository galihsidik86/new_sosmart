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
  createItemInputSchema,
  type CreateItemInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ItemsService } from './items.service.js';

@Controller('items')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.items.list({
      search,
      onlyActive: onlyActive !== 'false',
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.items.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createItemInputSchema)) body: CreateItemInput,
  ) {
    return this.items.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createItemInputSchema.partial()))
    body: Partial<CreateItemInput>,
  ) {
    return this.items.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Param('id') id: string) {
    return this.items.deactivate(id);
  }
}
