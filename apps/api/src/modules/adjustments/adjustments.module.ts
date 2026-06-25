import { Module } from '@nestjs/common';
import { AdjustmentsController } from './adjustments.controller.js';
import { AdjustmentsService } from './adjustments.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [JournalsModule, InventoryModule],
  controllers: [AdjustmentsController],
  providers: [AdjustmentsService],
  exports: [AdjustmentsService],
})
export class AdjustmentsModule {}
