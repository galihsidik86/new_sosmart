import { Module } from '@nestjs/common';
import { GlConfigController } from './gl-config.controller.js';

@Module({
  controllers: [GlConfigController],
})
export class GlConfigControllerModule {}
