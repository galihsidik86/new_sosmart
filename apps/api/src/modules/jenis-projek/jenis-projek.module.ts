import { Module } from '@nestjs/common';
import { JenisProjekController } from './jenis-projek.controller.js';
import { JenisProjekService } from './jenis-projek.service.js';

@Module({
  controllers: [JenisProjekController],
  providers: [JenisProjekService],
  exports: [JenisProjekService],
})
export class JenisProjekModule {}
