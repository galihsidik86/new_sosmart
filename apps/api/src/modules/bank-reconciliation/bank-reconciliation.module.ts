import { Module } from '@nestjs/common';
import { BankReconciliationController } from './bank-reconciliation.controller.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';

@Module({
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
