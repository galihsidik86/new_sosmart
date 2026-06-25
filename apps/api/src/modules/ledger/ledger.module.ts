import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';
import { TrialBalanceService } from './trial-balance.service.js';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, TrialBalanceService],
  exports: [LedgerService, TrialBalanceService],
})
export class LedgerModule {}
