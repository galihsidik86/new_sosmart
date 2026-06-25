import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service.js';
import { TenantContext } from './tenant-context.js';

@Global()
@Module({
  providers: [TenancyService, TenantContext],
  exports: [TenancyService, TenantContext],
})
export class TenancyModule {}
