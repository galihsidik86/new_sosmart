import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PeriodStatus } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

@Injectable()
export class PeriodsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  listYears() {
    return this.tenancy.run((tx) =>
      tx.fiscalYear.findMany({
        orderBy: { startDate: 'desc' },
        include: {
          periods: {
            orderBy: { no: 'asc' },
          },
        },
      }),
    );
  }

  /**
   * Resolve periode untuk tanggal tertentu.
   * Dipakai engine GL (Fase 3+) untuk routing posting ke periode yang benar.
   */
  resolveByDate(date: Date) {
    return this.tenancy.run((tx) =>
      tx.fiscalPeriod.findFirst({
        where: {
          startDate: { lte: date },
          endDate: { gte: date },
        },
        include: { fiscalYear: true },
      }),
    );
  }

  /**
   * Hard guard: dipanggil dari semua handler posting transaksi.
   * Throw kalau periode untuk tanggal tsb sudah CLOSED.
   * Boleh masih CLOSING (asal user OWNER/ADMIN — kebijakan di atas layer ini).
   */
  async assertOpen(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<void> {
    const period = await tx.fiscalPeriod.findFirst({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (!period) {
      throw new BadRequestException(
        `Tanggal ${date.toISOString().slice(0, 10)} di luar tahun buku — buat periode dulu`,
      );
    }
    if (period.status === PeriodStatus.CLOSED) {
      throw new ForbiddenException(
        `Periode ${period.label} sudah ditutup — tidak bisa post transaksi`,
      );
    }
  }

  async closePeriod(periodId: string, catatan?: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      const p = await tx.fiscalPeriod.findUnique({ where: { id: periodId } });
      if (!p) throw new NotFoundException('Periode tidak ditemukan');
      if (p.status === PeriodStatus.CLOSED) {
        throw new BadRequestException('Periode sudah ditutup');
      }
      // Pastikan periode sebelumnya sudah ditutup (chain rule).
      const prev = await tx.fiscalPeriod.findFirst({
        where: {
          tenantId: p.tenantId,
          fiscalYearId: p.fiscalYearId,
          no: p.no - 1,
        },
      });
      if (prev && prev.status !== PeriodStatus.CLOSED) {
        throw new BadRequestException(
          `Periode ${prev.label} belum ditutup — tutup periode sebelumnya dulu`,
        );
      }
      return tx.fiscalPeriod.update({
        where: { id: periodId },
        data: {
          status: PeriodStatus.CLOSED,
          closedAt: new Date(),
          closedById: userId,
          catatanTutup: catatan ?? null,
        },
      });
    });
  }

  async reopenPeriod(periodId: string, alasan: string) {
    return this.tenancy.run(async (tx) => {
      const p = await tx.fiscalPeriod.findUnique({ where: { id: periodId } });
      if (!p) throw new NotFoundException('Periode tidak ditemukan');
      if (p.status !== PeriodStatus.CLOSED) {
        throw new BadRequestException('Periode belum ditutup');
      }
      // Buka kembali = hanya periode terakhir yang ditutup (cegah cascade chaos).
      const newer = await tx.fiscalPeriod.findFirst({
        where: {
          tenantId: p.tenantId,
          fiscalYearId: p.fiscalYearId,
          no: { gt: p.no },
          status: PeriodStatus.CLOSED,
        },
      });
      if (newer) {
        throw new BadRequestException(
          `Tidak bisa membuka ${p.label}: periode berikutnya (${newer.label}) sudah ditutup. Buka periode terakhir dulu.`,
        );
      }
      return tx.fiscalPeriod.update({
        where: { id: periodId },
        data: {
          status: PeriodStatus.OPEN,
          closedAt: null,
          closedById: null,
          catatanTutup: alasan, // simpan jejak alasan reopen
        },
      });
    });
  }
}
