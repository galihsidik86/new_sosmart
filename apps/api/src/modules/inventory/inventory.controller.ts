import { Controller, Get, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  /** Saldo stok terkini per (item × cabang). */
  @Get('saldo')
  saldo(@Query('cabangId') cabangId?: string) {
    return this.inv.saldoMatrix({ cabangId });
  }

  @Get('saldo/export.xlsx')
  async exportSaldoXlsx(@Res() reply: ReplyLike, @Query('cabangId') cabangId?: string) {
    sendXlsx(reply, 'saldo-stok.xlsx', await this.inv.exportSaldoXlsx({ cabangId }));
  }

  /** Kartu stok detail per item. */
  @Get('kartu-stok')
  kartu(
    @Query('itemId') itemId: string,
    @Query('cabangId') cabangId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inv.kartuStok({
      itemId,
      cabangId,
      startDate: startDate ? new Date(startDate + 'T00:00:00Z') : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59Z') : undefined,
    });
  }

  @Get('kartu-stok/export.xlsx')
  async exportKartuStokXlsx(
    @Res() reply: ReplyLike,
    @Query('itemId') itemId: string,
    @Query('cabangId') cabangId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    sendXlsx(reply, 'kartu-stok.xlsx', await this.inv.exportKartuStokXlsx({
      itemId, cabangId,
      startDate: startDate ? new Date(startDate + 'T00:00:00Z') : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59Z') : undefined,
    }));
  }
}
