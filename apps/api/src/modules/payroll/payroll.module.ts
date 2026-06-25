import { Module } from '@nestjs/common';
import { KaryawanController } from './karyawan.controller.js';
import { KaryawanService } from './karyawan.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { JournalsModule } from '../journals/journals.module.js';

@Module({
  imports: [JournalsModule],
  controllers: [KaryawanController, PayrollController],
  providers: [KaryawanService, PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
