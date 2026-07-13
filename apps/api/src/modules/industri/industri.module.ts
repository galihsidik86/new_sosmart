import { Module } from '@nestjs/common';
import { IndustriController } from './industri.controller.js';
import { IndustriService } from './industri.service.js';

@Module({
  controllers: [IndustriController],
  providers: [IndustriService],
  exports: [IndustriService],
})
export class IndustriModule {}
