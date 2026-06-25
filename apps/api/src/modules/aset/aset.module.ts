import { Module } from '@nestjs/common';
import { AsetController } from './aset.controller.js';
import { AsetService } from './aset.service.js';
import { DepresiasiController } from './depresiasi.controller.js';
import { DepresiasiService } from './depresiasi.service.js';
import { JournalsModule } from '../journals/journals.module.js';

@Module({
  imports: [JournalsModule],
  controllers: [AsetController, DepresiasiController],
  providers: [AsetService, DepresiasiService],
  exports: [AsetService, DepresiasiService],
})
export class AsetModule {}
