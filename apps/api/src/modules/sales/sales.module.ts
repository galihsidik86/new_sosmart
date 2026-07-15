import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import { SalesPdfService } from './sales-pdf.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ApprovalModule } from '../approval/approval.module.js';

@Module({
  imports: [JournalsModule, InventoryModule, ApprovalModule],
  controllers: [SalesController],
  providers: [SalesService, SalesPdfService],
  exports: [SalesService],
})
export class SalesModule {}
