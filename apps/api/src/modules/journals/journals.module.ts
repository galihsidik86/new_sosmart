import { Module } from '@nestjs/common';
import { JournalsController } from './journals.controller.js';
import { JournalsService } from './journals.service.js';
import { JournalPdfService } from './journal-pdf.service.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ApprovalModule } from '../approval/approval.module.js';

@Module({
  imports: [PeriodsModule, ProjectsModule, ApprovalModule],
  controllers: [JournalsController],
  providers: [JournalsService, JournalPdfService],
  exports: [JournalsService],
})
export class JournalsModule {}
