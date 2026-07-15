import { Module } from '@nestjs/common';
import { JenisPelangganController } from './jenis-pelanggan.controller.js';
import { JenisPelangganService } from './jenis-pelanggan.service.js';

@Module({
  controllers: [JenisPelangganController],
  providers: [JenisPelangganService],
  exports: [JenisPelangganService],
})
export class JenisPelangganModule {}
