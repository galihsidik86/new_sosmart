import { Global, Module } from '@nestjs/common';
import { BuktiPotongController } from './bukti-potong.controller.js';
import { BuktiPotongService } from './bukti-potong.service.js';

@Global()
@Module({
  controllers: [BuktiPotongController],
  providers: [BuktiPotongService],
  exports: [BuktiPotongService],
})
export class BuktiPotongModule {}
