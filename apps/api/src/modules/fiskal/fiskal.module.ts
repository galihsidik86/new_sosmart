import { Module } from '@nestjs/common';
import { FiskalController } from './fiskal.controller.js';
import { FiskalService } from './fiskal.service.js';

@Module({
  controllers: [FiskalController],
  providers: [FiskalService],
})
export class FiskalModule {}
