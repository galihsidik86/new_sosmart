import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';
import { PurchasePdfService } from './purchase-pdf.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [JournalsModule, InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchasePdfService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
