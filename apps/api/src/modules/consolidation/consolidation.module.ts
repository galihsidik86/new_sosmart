import { Module } from '@nestjs/common';
import { ConsolidationController } from './consolidation.controller.js';
import { ConsolidationService } from './consolidation.service.js';

@Module({
  controllers: [ConsolidationController],
  providers: [ConsolidationService],
  exports: [ConsolidationService],
})
export class ConsolidationModule {}
