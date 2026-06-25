import { Module } from '@nestjs/common';
import { CashBankController } from './cashbank.controller.js';
import { CashBankService } from './cashbank.service.js';
import { JournalsModule } from '../journals/journals.module.js';

@Module({
  imports: [JournalsModule],
  controllers: [CashBankController],
  providers: [CashBankService],
  exports: [CashBankService],
})
export class CashBankModule {}
