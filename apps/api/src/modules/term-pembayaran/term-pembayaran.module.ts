import { Module } from '@nestjs/common';
import { TermPembayaranController } from './term-pembayaran.controller.js';
import { TermPembayaranService } from './term-pembayaran.service.js';

@Module({
  controllers: [TermPembayaranController],
  providers: [TermPembayaranService],
  exports: [TermPembayaranService],
})
export class TermPembayaranModule {}
