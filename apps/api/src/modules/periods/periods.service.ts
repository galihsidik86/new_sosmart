import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PeriodStatus, FiscalYearStatus } from '@lentera/db';
import type { CreateFiscalYearInput } from '@lentera/shared/schemas';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Key advisory lock per periode — dipakai PeriodsService sendiri (shared utk
 * resolve/assertOpen, exclusive utk close/reopen) DAN FiscalYearClosingService
 * (exclusive, method lokal `lockPeriodExclusiveInTx` di file itu — tidak bisa
 * inject PeriodsService di sana karena circular dependency, jadi cukup impor
 * fungsi murni ini supaya key-nya tetap SAMA PERSIS dan saling exclude).
 */
export function periodLockKey(periodId: string): string {
  return `period:${periodId}`;
}

interface ResolvedPeriod {
  id: string;
  status: PeriodStatus;
  label: string;
}

@Injectable()
export class PeriodsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(): Promise<Buffer> {
    const years = await this.listYears();
    const flat = years.flatMap((y) =>
      y.periods.map((p) => ({
        tahunBuku: y.kode,
        no: p.no, label: p.label,
        startDate: p.startDate, endDate: p.endDate,
        status: p.status,
        closedAt: p.closedAt,
        catatanTutup: p.catatanTutup,
      })),
    );
    return this.excel.buildBuffer(
      'Periode Buku',
      [
        { header: 'Tahun Buku', key: 'tb', width: 12, value: (r) => r.tahunBuku },
        { header: 'No', key: 'no', width: 6, format: 'number', value: (r) => r.no },
        { header: 'Label', key: 'label', width: 16, value: (r) => r.label },
        { header: 'Mulai', key: 'start', width: 12, format: 'date', value: (r) => r.startDate },
        { header: 'Selesai', key: 'end', width: 12, format: 'date', value: (r) => r.endDate },
        { header: 'Status', key: 'status', width: 12, value: (r) => r.status },
        { header: 'Tanggal Tutup', key: 'closed', width: 12, format: 'date', value: (r) => r.closedAt ?? '' },
        { header: 'Catatan Tutup', key: 'cat', width: 40, value: (r) => r.catatanTutup ?? '' },
      ],
      flat,
    );
  }

  /**
   * Bikin tahun buku baru + 12 periode bulanan sekaligus (satu transaksi) —
   * dipakai untuk onboarding tahun berikutnya (mis. 2027) atau mengisi data
   * historis (mis. 2024/2025). Tidak ada chain-rule terhadap tahun buku lain
   * (boleh dibuat kapan pun, tidak harus tahun sebelumnya sudah ditutup) —
   * beda dari closePeriod/closeFiscalYear yang memang berurutan, karena di
   * sini tujuannya justru termasuk mengisi rentang tahun yang belum ada.
   */
  async createFiscalYear(input: CreateFiscalYearInput) {
    const tenantId = this.ctx.require().tenantId;
    const start = new Date(input.startDate + 'T00:00:00Z');
    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth(); // 0-11
    // Hari terakhir bulan ke-12 dari startMonth — Date.UTC otomatis rollover
    // tahun kalau startMonth + 12 > 11, jadi berlaku juga utk tahun buku yang
    // mulai bukan Januari (non-kalender).
    const endDate = new Date(Date.UTC(startYear, startMonth + 12, 0));

    return this.tenancy.run(async (tx) => {
      // Cegah tumpang tindih tanggal dengan tahun buku lain di tenant ini —
      // dua tahun buku yang rentangnya beririsan akan bikin resolveByDate/
      // assertOpen ambigu (bisa dapat >1 match atau match yang salah).
      const overlap = await tx.fiscalYear.findFirst({
        where: { startDate: { lte: endDate }, endDate: { gte: start } },
      });
      if (overlap) {
        throw new BadRequestException(
          `Rentang tanggal tumpang tindih dengan Tahun Buku ${overlap.kode} ` +
          `(${overlap.startDate.toISOString().slice(0, 10)} — ${overlap.endDate.toISOString().slice(0, 10)})`,
        );
      }

      try {
        return await tx.fiscalYear.create({
          data: {
            tenantId,
            kode: input.kode,
            startDate: start,
            endDate,
            status: FiscalYearStatus.OPEN,
            periods: {
              create: Array.from({ length: 12 }, (_, i) => {
                const periodStart = new Date(Date.UTC(startYear, startMonth + i, 1));
                const periodEnd = new Date(Date.UTC(startYear, startMonth + i + 1, 0));
                return {
                  tenantId,
                  no: i + 1,
                  label: `${MONTH_NAMES[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`,
                  startDate: periodStart,
                  endDate: periodEnd,
                  status: PeriodStatus.OPEN,
                };
              }),
            },
          },
          include: { periods: { orderBy: { no: 'asc' } } },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Kode tahun buku "${input.kode}" sudah dipakai`);
        }
        throw e;
      }
    });
  }

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
   * Resolve periode utk tanggal + shared advisory lock SEBELUM baca status.
   * Tanpa ini, TOCTOU: transaksi A baca status OPEN, lalu closePeriod (yang
   * pegang lock EXCLUSIVE key sama) commit di tengah-tengah, transaksi A
   * lanjut posting padahal periode sudah CLOSED. Shared lock artinya banyak
   * transaksi posting boleh baca bersamaan (tidak saling blok), tapi SEMUA
   * harus nunggu closePeriod/reopenPeriod (exclusive) selesai commit dulu —
   * dan re-fetch di bawah ini baca status FRESH setelah lock didapat, bukan
   * status basi dari sebelum menunggu.
   */
  private async resolvePeriodForDateLocked(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<ResolvedPeriod | null> {
    const initial = await tx.fiscalPeriod.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true },
    });
    if (!initial) return null;
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))`,
      periodLockKey(initial.id),
    );
    return tx.fiscalPeriod.findUnique({
      where: { id: initial.id },
      select: { id: true, status: true, label: true },
    });
  }

  /**
   * Dipakai JournalsService.createDraftInTx/reverseInTx — kedua pemanggil
   * itu punya pesan error sendiri-sendiri per kasus (beda dari assertOpen),
   * jadi expose hasil resolve+lock mentah, bukan cuma throw generik.
   */
  resolvePeriodForPosting(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<ResolvedPeriod | null> {
    return this.resolvePeriodForDateLocked(tx, date);
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
    const period = await this.resolvePeriodForDateLocked(tx, date);
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
      // EXCLUSIVE lock SEBELUM baca status — key sama dgn shared lock di
      // resolvePeriodForDateLocked, jadi close ini nunggu semua transaksi
      // posting yang SEDANG baca status periode ini commit dulu, dan
      // posting baru yang mulai setelah close ini commit akan baca status
      // CLOSED yang fresh.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        periodLockKey(periodId),
      );
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
      // Sama seperti closePeriod — exclusive lock sebelum baca status.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        periodLockKey(periodId),
      );
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
