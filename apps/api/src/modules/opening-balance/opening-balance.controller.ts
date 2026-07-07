import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  cancelInvoiceInputSchema,
  saldoAwalPiutangInputSchema,
  saldoAwalUtangInputSchema,
  setSaldoAwalAkunInputSchema,
  setSaldoAwalPersediaanInputSchema,
  type CancelInvoiceInput,
  type SaldoAwalPiutangInput,
  type SaldoAwalUtangInput,
  type SetSaldoAwalAkunInput,
  type SetSaldoAwalPersediaanInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { OpeningBalanceService } from './opening-balance.service.js';

@Controller('opening-balance')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
@Roles('OWNER', 'ADMIN', 'AKUNTAN')
export class OpeningBalanceController {
  constructor(private readonly ob: OpeningBalanceService) {}

  @Get('run')
  getRun() {
    return this.ob.getRun();
  }

  @Get('preview')
  preview() {
    return this.ob.preview();
  }

  @Post('post')
  post(@Headers('x-requested-by-user-id') requestedById?: string) {
    return this.ob.post(requestedById);
  }

  @Post('void')
  void(
    @Body(new ZodValidationPipe(cancelInvoiceInputSchema)) body: CancelInvoiceInput,
    @Headers('x-requested-by-user-id') requestedById?: string,
  ) {
    return this.ob.void(body.alasan, requestedById);
  }

  @Get('akun')
  listAkun() {
    return this.ob.listAkun();
  }

  @Put('akun')
  setAkun(
    @Body(new ZodValidationPipe(setSaldoAwalAkunInputSchema)) body: SetSaldoAwalAkunInput,
  ) {
    return this.ob.setAkunLines(body);
  }

  @Get('piutang')
  listPiutang() {
    return this.ob.listPiutang();
  }

  @Post('piutang')
  addPiutang(
    @Body(new ZodValidationPipe(saldoAwalPiutangInputSchema)) body: SaldoAwalPiutangInput,
  ) {
    return this.ob.addPiutang(body);
  }

  @Delete('piutang/:id')
  removePiutang(@Param('id') id: string) {
    return this.ob.removePiutang(id);
  }

  @Get('utang')
  listUtang() {
    return this.ob.listUtang();
  }

  @Post('utang')
  addUtang(
    @Body(new ZodValidationPipe(saldoAwalUtangInputSchema)) body: SaldoAwalUtangInput,
  ) {
    return this.ob.addUtang(body);
  }

  @Delete('utang/:id')
  removeUtang(@Param('id') id: string) {
    return this.ob.removeUtang(id);
  }

  @Get('persediaan')
  listPersediaan() {
    return this.ob.listPersediaan();
  }

  @Put('persediaan')
  setPersediaan(
    @Body(new ZodValidationPipe(setSaldoAwalPersediaanInputSchema)) body: SetSaldoAwalPersediaanInput,
  ) {
    return this.ob.setPersediaan(body);
  }

  @Delete('persediaan/:id')
  removePersediaan(@Param('id') id: string) {
    return this.ob.removePersediaan(id);
  }
}
