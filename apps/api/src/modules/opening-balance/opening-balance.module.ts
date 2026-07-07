import { Module } from '@nestjs/common';
import { OpeningBalanceController } from './opening-balance.controller.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PeriodsModule } from '../periods/periods.module.js';

@Module({
  imports: [JournalsModule, InventoryModule, PeriodsModule],
  controllers: [OpeningBalanceController],
  providers: [OpeningBalanceService],
  exports: [OpeningBalanceService],
})
export class OpeningBalanceModule {}
