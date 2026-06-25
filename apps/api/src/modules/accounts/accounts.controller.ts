import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@Query('view') view?: 'flat' | 'tree') {
    return view === 'tree' ? this.accounts.tree() : this.accounts.flat();
  }
}
