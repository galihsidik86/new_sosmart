import { Module } from '@nestjs/common';
import { JournalsController } from './journals.controller.js';
import { JournalsService } from './journals.service.js';
import { PeriodsModule } from '../periods/periods.module.js';

@Module({
  imports: [PeriodsModule],
  controllers: [JournalsController],
  providers: [JournalsService],
  exports: [JournalsService],
})
export class JournalsModule {}
