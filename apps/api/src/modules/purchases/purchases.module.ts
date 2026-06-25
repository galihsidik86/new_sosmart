import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [JournalsModule, InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
