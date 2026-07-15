import { Module } from '@nestjs/common';
import { CashBankController } from './cashbank.controller.js';
import { CashBankService } from './cashbank.service.js';
import { JournalsModule } from '../journals/journals.module.js';
import { ApprovalModule } from '../approval/approval.module.js';

@Module({
  imports: [JournalsModule, ApprovalModule],
  controllers: [CashBankController],
  providers: [CashBankService],
  exports: [CashBankService],
})
export class CashBankModule {}
