import { Module } from '@nestjs/common';
import { SptController } from './spt.controller.js';
import { SptPpnService } from './spt-ppn.service.js';
import { SptPphService } from './spt-pph.service.js';

@Module({
  controllers: [SptController],
  providers: [SptPpnService, SptPphService],
  exports: [SptPpnService, SptPphService],
})
export class SptModule {}
