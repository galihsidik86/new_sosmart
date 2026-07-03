import { Module } from '@nestjs/common';
import { Pph23TarifController } from './pph23-tarif.controller.js';
import { Pph23TarifService } from './pph23-tarif.service.js';

@Module({
  controllers: [Pph23TarifController],
  providers: [Pph23TarifService],
  exports: [Pph23TarifService],
})
export class Pph23TarifModule {}
