import { Module } from '@nestjs/common';
import { ConsolidationController } from './consolidation.controller.js';
import { ConsolidationService } from './consolidation.service.js';
import { ConsolidationExportService } from './consolidation-export.service.js';

@Module({
  controllers: [ConsolidationController],
  providers: [ConsolidationService, ConsolidationExportService],
  exports: [ConsolidationService],
})
export class ConsolidationModule {}
