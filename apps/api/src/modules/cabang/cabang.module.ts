import { Module } from '@nestjs/common';
import { CabangController } from './cabang.controller.js';
import { CabangService } from './cabang.service.js';

@Module({
  controllers: [CabangController],
  providers: [CabangService],
})
export class CabangModule {}
