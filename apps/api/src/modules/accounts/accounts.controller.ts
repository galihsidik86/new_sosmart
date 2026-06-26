import {
  Body, Controller, Get, Param, Patch, Query,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  updateAccountInputSchema,
  type UpdateAccountInput,
} from '@lentera/shared/schemas';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@Query('view') view?: 'flat' | 'tree') {
    return view === 'tree' ? this.accounts.tree() : this.accounts.flat();
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.accounts.byId(id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountInputSchema))
    body: UpdateAccountInput,
  ) {
    return this.accounts.update(id, body);
  }
}
