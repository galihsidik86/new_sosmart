import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service.js';

@Global()
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
