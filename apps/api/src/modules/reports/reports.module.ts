import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { LabaRugiService } from './laba-rugi.service.js';
import { NeracaService } from './neraca.service.js';
import { ArusKasService } from './arus-kas.service.js';
import { PerubahanEkuitasService } from './perubahan-ekuitas.service.js';
import { ReportsPdfService } from './reports-pdf.service.js';
import { ReportsExcelService } from './reports-excel.service.js';

@Module({
  controllers: [ReportsController],
  providers: [
    LabaRugiService,
    NeracaService,
    ArusKasService,
    PerubahanEkuitasService,
    ReportsPdfService,
    ReportsExcelService,
  ],
  exports: [
    LabaRugiService,
    NeracaService,
    ArusKasService,
    PerubahanEkuitasService,
    ReportsExcelService,
  ],
})
export class ReportsModule {}
