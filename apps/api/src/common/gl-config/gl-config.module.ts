import { Global, Module } from '@nestjs/common';
import { GlConfigService } from './gl-config.service.js';

@Global()
@Module({
  providers: [GlConfigService],
  exports: [GlConfigService],
})
export class GlConfigModule {}
