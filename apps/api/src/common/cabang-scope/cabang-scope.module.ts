import { Global, Module } from '@nestjs/common';
import { CabangScopeService } from './cabang-scope.service.js';

@Global()
@Module({
  providers: [CabangScopeService],
  exports: [CabangScopeService],
})
export class CabangScopeModule {}
