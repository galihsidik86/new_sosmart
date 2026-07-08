import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  AccountKind,
  FiscalYearStatus,
  JournalSource,
  JournalStatus,
  NormalBalance,
  PeriodStatus,
  Prisma,
} from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { JournalsService } from '../journals/journals.service.js';
import { periodLockKey } from '../periods/periods.service.js';
import { aggregateAllAccounts, mutasiSigned } from '../reports/helpers.js';

const PL_KINDS: AccountKind[] = [
  AccountKind.PENDAPATAN,
  AccountKind.BEBAN_POKOK,
  AccountKind.BEBAN,
  AccountKind.PENDAPATAN_LAIN,
  AccountKind.BEBAN_LAIN,
];

/**
 * Tutup buku akhir tahun: posting jurnal penutup (nolkan akun Pendapatan/
 * Beban ke Laba Ditahan) + tutup periode terakhir + tandai FiscalYear CLOSED,
 * SATU aksi atomik. Berdiri sendiri (bukan method di PeriodsService) supaya
 * bisa inject JournalsService tanpa circular dependency — JournalsModule
 * sudah import PeriodsModule, jadi PeriodsModule tidak boleh balik import
 * JournalsModule.
 *
 * Chain-rule periode di-inline di sini (bukan panggil PeriodsService.closePeriod/
 * reopenPeriod) karena method itu masing-masing buka tenancy.run() sendiri —
 * Prisma tidak support nested $transaction (pelajaran dari fitur Saldo Awal).
 */
@Injectable()
export class FiscalYearClosingService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly glConfig: GlConfigService,
    private readonly journals: JournalsService,
  ) {}

  /**
   * Lock per-fiscal-year (pola sama InventoryService.lockItem) — tanpa ini,
   * dua request close/reopen bersamaan untuk fiscalYearId yang SAMA bisa
   * sama-sama lolos precondition check (belum ada yang commit statusnya),
   * lalu sama-sama posting jurnal penutup / sama-sama reverse — dobel
   * jurnal penutup (laba dipindah 2×) atau dobel-reverse. Advisory lock
   * (transaction-scoped) bikin request kedua BLOK sampai yang pertama
   * commit, baru baca status yang sudah ter-update.
   */
  private async lockFiscalYearInTx(tx: Prisma.TransactionClient, fiscalYearId: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      `fiscal-year-closing:${fiscalYearId}`,
    );
  }

  /**
   * Exclusive lock per-periode, key SAMA PERSIS (`periodLockKey`) dengan yang
   * dipakai `PeriodsService.closePeriod/reopenPeriod` dan shared lock di
   * `resolvePeriodForDateLocked` (dipakai JournalsService.createDraftInTx/
   * postInTx/reverseInTx). Tanpa ini, closeFiscalYear/reopenFiscalYear yang
   * mengubah status periode terakhir bisa TOCTOU-race dengan posting jurnal
   * yang lagi baca status periode yang sama lewat jalur PeriodsService — dua
   * jalur ini (PeriodsService & FiscalYearClosingService) TIDAK bisa share
   * kode langsung (circular dependency, lihat komentar class di atas), jadi
   * cukup duplikasi raw SQL pendek ini dengan key format yang di-impor supaya
   * tetap saling exclude.
   */
  private async lockPeriodExclusiveInTx(tx: Prisma.TransactionClient, periodId: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      periodLockKey(periodId),
    );
  }

  async closeFiscalYear(fiscalYearId: string, catatan?: string) {
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      await this.lockFiscalYearInTx(tx, fiscalYearId);
      const fy = await tx.fiscalYear.findUnique({
        where: { id: fiscalYearId },
        include: { periods: { orderBy: { no: 'asc' } } },
      });
      if (!fy) throw new NotFoundException('Tahun buku tidak ditemukan');
      if (fy.status === FiscalYearStatus.CLOSED) {
        throw new BadRequestException('Tahun buku sudah ditutup');
      }
      if (fy.periods.length === 0) {
        throw new BadRequestException('Tahun buku belum punya periode');
      }

      const last = fy.periods[fy.periods.length - 1]!;
      // Exclusive lock periode terakhir SEBELUM baca status-nya — key sama
      // dgn shared lock di jalur posting jurnal (PeriodsService), supaya
      // tidak TOCTOU-race dgn transaksi posting yang lagi baca status
      // periode ini. Re-fetch setelah lock karena status bisa berubah
      // selagi menunggu.
      await this.lockPeriodExclusiveInTx(tx, last.id);
      const freshLast = await tx.fiscalPeriod.findUnique({ where: { id: last.id } });
      if (!freshLast) throw new NotFoundException('Periode tidak ditemukan');

      const belumTutup = fy.periods.filter(
        (p) => p.id !== last.id && p.status !== PeriodStatus.CLOSED,
      );
      if (belumTutup.length > 0) {
        throw new BadRequestException(
          `Tutup periode berikut dulu sebelum tutup tahun buku: ${belumTutup.map((p) => p.label).join(', ')}`,
        );
      }
      if (freshLast.status === PeriodStatus.CLOSED) {
        throw new BadRequestException(`Periode terakhir (${freshLast.label}) sudah ditutup`);
      }

      // Hitung jurnal penutup: nolkan mutasi tahun berjalan akun Pendapatan/
      // Beban, arah closing per-akun ikuti normalBalance (bukan kind — ada
      // akun kontra mis. Retur Penjualan yang normalBalance-nya kebalik).
      const { mutasiByAcc, accounts } = await aggregateAllAccounts(tx, {
        startDate: fy.startDate,
        endDate: fy.endDate,
        includeKinds: PL_KINDS,
      });

      const closingLines: Array<{ accountId: string; debit: string; kredit: string }> = [];
      let labaBersih = new Decimal(0);
      for (const acc of accounts.values()) {
        const signed = mutasiSigned(acc, mutasiByAcc.get(acc.id));
        if (signed.eq(0)) continue;
        const isDebitNormal = acc.normalBalance === NormalBalance.DEBIT;
        // Kontribusi akun ini ke laba bersih: akun normal-KREDIT (pendapatan)
        // menambah, akun normal-DEBIT (beban, TERMASUK kontra-pendapatan
        // seperti Retur/Potongan Penjualan yang normalBalance-nya DEBIT
        // walau kind-nya PENDAPATAN) mengurangi. Ini BUKAN pengelompokan per
        // `kind` (beda dari LabaRugiService yang sum per-kind lalu kurangi —
        // itu salah kalau ada akun kontra lintas kind/normalBalance) —
        // sign di sini murni dari normalBalance, sehingga otomatis benar
        // untuk akun kontra apa pun.
        labaBersih = isDebitNormal ? labaBersih.minus(signed) : labaBersih.plus(signed);
        const jumlah = signed.abs().toFixed(2);
        // Saldo positif (di sisi normal akun) → closing masuk ke sisi lawan
        // supaya akun nol; saldo negatif (abnormal) → closing di sisi normal.
        const closingKeSisiNormal = signed.lt(0);
        const kirimDebit = isDebitNormal === closingKeSisiNormal;
        closingLines.push({
          accountId: acc.id,
          debit: kirimDebit ? jumlah : '0',
          kredit: kirimDebit ? '0' : jumlah,
        });
      }

      let closingJournalId: string | null = null;
      if (closingLines.length > 0) {
        if (!labaBersih.eq(0)) {
          const labaDitahanId = await this.glConfig.getAccountIdInTx(tx, 'LABA_DITAHAN');
          if (labaBersih.gt(0)) {
            closingLines.push({ accountId: labaDitahanId, debit: '0', kredit: labaBersih.toFixed(2) });
          } else {
            closingLines.push({ accountId: labaDitahanId, debit: labaBersih.abs().toFixed(2), kredit: '0' });
          }
        }

        const cabang =
          (await tx.cabang.findFirst({ where: { isPusat: true } })) ?? (await tx.cabang.findFirst());
        if (!cabang) throw new BadRequestException('Buat cabang dulu sebelum tutup tahun buku');

        const draft = await this.journals.createDraftInTx(tx, {
          cabangId: cabang.id,
          tanggal: fy.endDate.toISOString().slice(0, 10),
          deskripsi: `Jurnal penutup tahun buku ${fy.kode}`,
          sumber: JournalSource.TUTUP_BUKU,
          sumberRef: fy.id,
          lines: closingLines,
        });
        const posted = await this.journals.postInTx(tx, draft.id);
        closingJournalId = posted.id;
      }

      await tx.fiscalPeriod.update({
        where: { id: last.id },
        data: {
          status: PeriodStatus.CLOSED,
          closedAt: new Date(),
          closedById: userId,
          catatanTutup: catatan ?? null,
        },
      });

      const updated = await tx.fiscalYear.update({
        where: { id: fy.id },
        data: {
          status: FiscalYearStatus.CLOSED,
          closedAt: new Date(),
          closedById: userId,
          catatanTutup: catatan ?? null,
        },
      });

      return { ...updated, closingJournalId, labaBersih: labaBersih.toFixed(2) };
    });
  }

  async reopenFiscalYear(fiscalYearId: string, alasan: string) {
    return this.tenancy.run(async (tx) => {
      await this.lockFiscalYearInTx(tx, fiscalYearId);
      const fy = await tx.fiscalYear.findUnique({
        where: { id: fiscalYearId },
        include: { periods: { orderBy: { no: 'asc' } } },
      });
      if (!fy) throw new NotFoundException('Tahun buku tidak ditemukan');
      if (fy.status !== FiscalYearStatus.CLOSED) {
        throw new BadRequestException('Tahun buku belum ditutup');
      }

      // Cegah reopen tahun lama selagi tahun berikutnya sudah berjalan/tertutup.
      const newerYearWithClosedPeriod = await tx.fiscalYear.findFirst({
        where: {
          tenantId: fy.tenantId,
          startDate: { gt: fy.startDate },
          periods: { some: { status: PeriodStatus.CLOSED } },
        },
      });
      if (newerYearWithClosedPeriod) {
        throw new BadRequestException(
          `Tidak bisa membuka ${fy.kode}: tahun buku ${newerYearWithClosedPeriod.kode} sudah punya periode tertutup. Buka tahun buku terbaru dulu.`,
        );
      }

      // Buka periode terakhir DULU, baru reverse jurnal penutup — reverseInTx
      // butuh periode yang OPEN untuk tanggal pembalik. Karena closeFiscalYear
      // menutup SEMUA periode tahun ini (bukan cuma Desember), jurnal penutup
      // (bertanggal fy.endDate) tidak bisa dibalik selama periode terakhir
      // masih CLOSED — jadi urutannya dibalik dari intuisi "reverse dulu baru
      // buka kunci".
      const last = fy.periods[fy.periods.length - 1];
      if (last) {
        // Sama seperti closeFiscalYear — exclusive lock + re-fetch fresh
        // status sebelum mutasi, key sama dgn jalur posting jurnal.
        await this.lockPeriodExclusiveInTx(tx, last.id);
        const freshLast = await tx.fiscalPeriod.findUnique({ where: { id: last.id } });
        if (freshLast && freshLast.status === PeriodStatus.CLOSED) {
          await tx.fiscalPeriod.update({
            where: { id: last.id },
            data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null, catatanTutup: alasan },
          });
        }
      }

      const closingJournal = await tx.journal.findFirst({
        where: { sumber: JournalSource.TUTUP_BUKU, sumberRef: fy.id, status: JournalStatus.POSTED },
      });
      if (closingJournal) {
        // Tanggal pembalik = fy.endDate (sama tanggal jurnal penutup, sekarang
        // sudah OPEN lagi) — BUKAN new Date() (hari ini), yang bisa jatuh di
        // periode lain dalam tahun yang sama (masih CLOSED, belum ikut dibuka).
        await this.journals.reverseInTx(tx, closingJournal.id, {
          tanggal: fy.endDate,
          alasan: `Buka kembali tahun buku ${fy.kode}: ${alasan}`,
        });
      }

      return tx.fiscalYear.update({
        where: { id: fy.id },
        data: { status: FiscalYearStatus.OPEN, closedAt: null, closedById: null, catatanTutup: alasan },
      });
    });
  }
}
