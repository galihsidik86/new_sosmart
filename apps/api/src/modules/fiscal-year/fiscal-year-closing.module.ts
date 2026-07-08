import { Module } from '@nestjs/common';
import { FiscalYearClosingController } from './fiscal-year-closing.controller.js';
import { FiscalYearClosingService } from './fiscal-year-closing.service.js';
import { JournalsModule } from '../journals/journals.module.js';

@Module({
  imports: [JournalsModule],
  controllers: [FiscalYearClosingController],
  providers: [FiscalYearClosingService],
  exports: [FiscalYearClosingService],
})
export class FiscalYearClosingModule {}
