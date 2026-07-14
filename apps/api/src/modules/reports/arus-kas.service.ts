import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AccountKind, JournalStatus } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { GlConfigService } from '../../common/gl-config/gl-config.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import { deriveIsKasSetara } from '@lentera/shared/enums';
import { aggregateAllAccounts, mutasiSigned, plKindContribution, saldoAkhirSigned } from './helpers.js';
import { JOURNAL_BALANCE_STATUSES } from '../../common/gl/journal-balance-statuses.js';

export interface ArusKasLine {
  label: string;
  /// + masuk kas, - keluar kas (perspektif kas masuk positif).
  nilai: string;
}

export type ArusKasDetailGranularity = 'harian' | 'bulanan';
export interface ArusKasDetailBucket {
  /// Kunci bucket: 'YYYY-MM-DD' (harian) atau 'YYYY-MM' (bulanan).
  bucket: string;
  masuk: string;
  keluar: string;
  bersih: string;
  saldoAkhir: string;
}
export interface ArusKasDetailResponse {
  granularity: ArusKasDetailGranularity;
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  kasAwal: string;
  totalMasuk: string;
  totalKeluar: string;
  kasAkhir: string;
  buckets: ArusKasDetailBucket[];
}

export interface ArusKasResponse {
  periode: { id: string; label: string; startDate: Date; endDate: Date };
  /// Aktivitas Operasi (metode tidak langsung)
  operasi: { rows: ArusKasLine[]; total: string };
  /// Aktivitas Investasi (Δ aset tetap, perolehan & disposal)
  investasi: { rows: ArusKasLine[]; total: string };
  /// Aktivitas Pendanaan (Δ utang bank, modal, dividen)
  pendanaan: { rows: ArusKasLine[]; total: string };
  /// Total perubahan kas bersih = operasi + investasi + pendanaan
  kenaikanKasBersih: string;
  /// Saldo kas awal periode (Kas + Bank).
  kasAwal: string;
  /// Saldo kas akhir periode.
  kasAkhir: string;
  /// Validasi: kasAwal + kenaikanKasBersih ≈ kasAkhir.
  balanced: boolean;
  selisih: string;
}

/**
 * Laporan Arus Kas — METODE TIDAK LANGSUNG (Indirect Method).
 *
 * Aktivitas Operasi:
 *   Laba Bersih
 *   + Penyusutan (non-kas)
 *   ± Δ Piutang Usaha (1-103)
 *   ± Δ Persediaan (1-104)
 *   ± Δ PPN Masukan (1-105)
 *   ± Δ Beban Dibayar Dimuka (1-106)
 *   ± Δ Utang Usaha (2-101)
 *   ± Δ Utang Pajak (2-102x)
 *   ± Δ Beban Masih Harus Dibayar (2-110)
 *   = Kas Bersih dari Operasi
 *
 * Aktivitas Investasi:
 *   - Pembelian Aset Tetap (mutasi debit 1-201..208)
 *   + Hasil penjualan Aset Tetap (lookup dari disposal journal)
 *
 * Aktivitas Pendanaan:
 *   ± Δ Utang Bank (2-201)
 *   + Tambahan Modal (mutasi kredit 3-101)
 *   - Dividen / Prive (mutasi debit 3-104)
 *
 * Logic: aturan kenaikan aset = pengurangan kas, kenaikan utang/ekuitas =
 * penambahan kas. Penyusutan adalah expense non-kas → ditambahkan kembali.
 */
@Injectable()
export class ArusKasService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly glConfig: GlConfigService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async build(opts: {
    periodId: string;
    cabangId?: string;
    /// YTD = dari awal tahun buku s/d endDate periode (default true).
    ytd?: boolean;
    /// Filter per project. null → hanya tanpa project. undefined = semua.
    projectId?: string | null;
  }): Promise<ArusKasResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: {
          id: true, label: true, startDate: true, endDate: true,
          fiscalYearId: true,
        },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      let startDate = period.startDate;
      if (opts.ytd ?? true) {
        const fy = await tx.fiscalYear.findUnique({
          where: { id: period.fiscalYearId },
          select: { startDate: true },
        });
        if (fy) startDate = fy.startDate;
      }

      // === Ambil mutasi periode untuk semua akun ===
      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const result = await aggregateAllAccounts(tx, {
        startDate,
        endDate: period.endDate,
        cabangId: opts.cabangId,
        allowedCabangIds: this.cabangScope.cabangIdsForWhere(),
        projectId: opts.projectId,
      });

      // === Resolve akun configurable via GlConfig ===
      const idPenyusutan = await this.glConfig.getAccountIdInTx(tx, 'BEBAN_PENYUSUTAN');
      const idModal = await this.glConfig.getAccountIdInTx(tx, 'MODAL_DISETOR');
      const idLabaDitahan = await this.glConfig.getAccountIdInTx(tx, 'LABA_DITAHAN');
      const idDividen = await this.glConfig.getAccountIdInTx(tx, 'DIVIDEN');
      // Utang Bank: pakai key config kalau ada; kalau akun-nya memang tidak ada,
      // pertahankan perilaku lama (delta 0) alih-alih throw.
      let idUtangBank: string | null = null;
      try {
        idUtangBank = await this.glConfig.getAccountIdInTx(tx, 'UTANG_BANK');
      } catch { /* akun utang bank belum ada → kontribusi 0 */ }

      // === Helper: nilai mutasi akun signed (saldo normal positif) ===
      const mut = (kode: string) => {
        const acc = [...result.accounts.values()].find((a) => a.kode === kode);
        if (!acc) return new Decimal(0);
        return mutasiSigned(acc, result.mutasiByAcc.get(acc.id));
      };
      const mutById = (id: string) => {
        const acc = result.accounts.get(id);
        if (!acc) return new Decimal(0);
        return mutasiSigned(acc, result.mutasiByAcc.get(id));
      };
      const sumMut = (kodePrefix: string) => {
        let s = new Decimal(0);
        for (const acc of result.accounts.values()) {
          if (acc.kode.startsWith(kodePrefix)) {
            s = s.plus(mutasiSigned(acc, result.mutasiByAcc.get(acc.id)));
          }
        }
        return s;
      };

      // === Laba Bersih periode ===
      let pendapatan = new Decimal(0);
      let beban = new Decimal(0);
      for (const acc of result.accounts.values()) {
        // plKindContribution: koreksi arah untuk akun kontra (lihat helpers.ts).
        const nilai = plKindContribution(acc, mutasiSigned(acc, result.mutasiByAcc.get(acc.id)));
        if (acc.kind === AccountKind.PENDAPATAN || acc.kind === AccountKind.PENDAPATAN_LAIN) {
          pendapatan = pendapatan.plus(nilai);
        } else if (
          acc.kind === AccountKind.BEBAN ||
          acc.kind === AccountKind.BEBAN_POKOK ||
          acc.kind === AccountKind.BEBAN_LAIN
        ) {
          beban = beban.plus(nilai);
        }
      }
      const labaBersih = pendapatan.minus(beban);

      // === Penyusutan (non-kas) — mutasi periode akun BEBAN_PENYUSUTAN ===
      const penyusutan = mutById(idPenyusutan);

      // === Δ Aset Lancar non-kas (positif = kenaikan = kurangi kas) ===
      // Note: kenaikan piutang/persediaan → kas turun, jadi tanda dibalik.
      const dPiutang = mut('1-103');
      const dPersediaan = mut('1-104');
      const dPpnMasukan = mut('1-105');
      const dBebanDimuka = mut('1-106');
      const dPph25 = mut('1-107');

      // === Δ Liabilitas Jangka Pendek ===
      const dUtangUsaha = mut('2-101');
      const dUtangPajak = sumMut('2-102'); // semua 2-102x
      // BPJS: 2-106 (karyawan) + 2-107 (kesehatan). Ambil langsung supaya
      // tidak rapuh kalau seed COA berubah (dulu pakai subtract-chain dari
      // sumMut('2-10') yang keliru match 2-110/2-111 juga).
      const dBpjs = sumMut('2-106').plus(sumMut('2-107'));
      const dBebanYMHD = mut('2-110');

      // Operasi
      const operasi: ArusKasLine[] = [
        { label: 'Laba Bersih', nilai: labaBersih.toFixed(2) },
        { label: 'Penyusutan (non-kas)', nilai: penyusutan.toFixed(2) },
        { label: '(Kenaikan) / Penurunan Piutang Usaha', nilai: dPiutang.negated().toFixed(2) },
        { label: '(Kenaikan) / Penurunan Persediaan', nilai: dPersediaan.negated().toFixed(2) },
        { label: '(Kenaikan) / Penurunan PPN Masukan', nilai: dPpnMasukan.negated().toFixed(2) },
        { label: '(Kenaikan) / Penurunan Beban Dibayar Dimuka', nilai: dBebanDimuka.negated().toFixed(2) },
        { label: '(Kenaikan) / Penurunan PPh 23/25 Dibayar Dimuka', nilai: dPph25.negated().toFixed(2) },
        { label: 'Kenaikan / (Penurunan) Utang Usaha', nilai: dUtangUsaha.toFixed(2) },
        { label: 'Kenaikan / (Penurunan) Utang Pajak', nilai: dUtangPajak.toFixed(2) },
        { label: 'Kenaikan / (Penurunan) Utang BPJS', nilai: dBpjs.toFixed(2) },
        { label: 'Kenaikan / (Penurunan) Beban Masih Harus Dibayar', nilai: dBebanYMHD.toFixed(2) },
      ];
      const totalOperasi = operasi.reduce((a, r) => a.plus(new Decimal(r.nilai)), new Decimal(0));

      // === Investasi ===
      // Δ saldo aset tetap (perolehan vs disposal). Kenaikan = pengeluaran kas.
      // Akun aset tetap: 1-201..1-208. Akumulasi (1-203, 1-205, 1-207) tidak masuk arus kas — itu non-kas.
      const dTanah = mut('1-201');
      const dBangunan = mut('1-202');
      const dKendaraan = mut('1-204');
      const dPeralatan = mut('1-206');

      const investasi: ArusKasLine[] = [
        { label: '(Pembelian) / Penjualan Tanah', nilai: dTanah.negated().toFixed(2) },
        { label: '(Pembelian) / Penjualan Bangunan', nilai: dBangunan.negated().toFixed(2) },
        { label: '(Pembelian) / Penjualan Kendaraan', nilai: dKendaraan.negated().toFixed(2) },
        { label: '(Pembelian) / Penjualan Peralatan & Mesin', nilai: dPeralatan.negated().toFixed(2) },
      ];
      const totalInvestasi = investasi.reduce((a, r) => a.plus(new Decimal(r.nilai)), new Decimal(0));

      // === Pendanaan ===
      const dUtangBank = idUtangBank ? mutById(idUtangBank) : new Decimal(0);
      const dModal = mutById(idModal);
      const dSaldoLaba = mutById(idLabaDitahan); // biasanya dari closing entry — bisa diabaikan untuk YTD
      const dDividen = mutById(idDividen).negated(); // saldo normal debit → mutasi positif = pembagian dividen (keluar kas)

      const pendanaan: ArusKasLine[] = [
        { label: 'Kenaikan / (Penurunan) Utang Bank', nilai: dUtangBank.toFixed(2) },
        { label: 'Penambahan Modal Disetor', nilai: dModal.toFixed(2) },
        { label: '(Pembagian Dividen / Prive)', nilai: dDividen.toFixed(2) },
      ];
      const totalPendanaan = pendanaan.reduce((a, r) => a.plus(new Decimal(r.nilai)), new Decimal(0));

      const kenaikanKas = totalOperasi.plus(totalInvestasi).plus(totalPendanaan);

      // === Kas Awal & Kas Akhir (semua akun kas & setara kas) ===
      // Sumber: field Account.isKasSetara. Fallback ke konvensi prefix HANYA
      // kalau belum ada satupun akun ditandai (data lama belum ter-backfill).
      let kasAccounts = [...result.accounts.values()].filter((a) => a.isKasSetara);
      if (kasAccounts.length === 0) {
        kasAccounts = [...result.accounts.values()].filter((a) => deriveIsKasSetara(a.kode));
      }
      let kasAwal = new Decimal(0);
      let kasAkhir = new Decimal(0);
      for (const acc of kasAccounts) {
        const sAwal = result.signedSaldoAwalByAcc.get(acc.id) ?? new Decimal(0);
        const sAkhir = saldoAkhirSigned(acc, sAwal, result.mutasiByAcc.get(acc.id));
        kasAwal = kasAwal.plus(sAwal);
        kasAkhir = kasAkhir.plus(sAkhir);
      }

      const selisih = kasAwal.plus(kenaikanKas).minus(kasAkhir);
      const balanced = selisih.abs().lte(new Decimal('0.5'));

      return {
        periode: {
          id: period.id, label: period.label,
          startDate, endDate: period.endDate,
        },
        operasi: { rows: operasi, total: totalOperasi.toFixed(2) },
        investasi: { rows: investasi, total: totalInvestasi.toFixed(2) },
        pendanaan: { rows: pendanaan, total: totalPendanaan.toFixed(2) },
        kenaikanKasBersih: kenaikanKas.toFixed(2),
        kasAwal: kasAwal.toFixed(2),
        kasAkhir: kasAkhir.toFixed(2),
        balanced,
        selisih: selisih.toFixed(2),
      };
    });
  }

  /**
   * Detail arus kas (metode langsung) — pergerakan kas & bank aktual
   * dikelompokkan per HARI (dalam periode) atau per BULAN (YTD tahun buku),
   * lengkap dengan saldo kas berjalan.
   */
  async buildDetail(opts: {
    periodId: string;
    granularity: ArusKasDetailGranularity;
    cabangId?: string;
    projectId?: string | null;
  }): Promise<ArusKasDetailResponse> {
    return this.tenancy.run(async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: opts.periodId },
        select: { id: true, label: true, startDate: true, endDate: true, fiscalYearId: true },
      });
      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      const granularity: ArusKasDetailGranularity =
        opts.granularity === 'bulanan' ? 'bulanan' : 'harian';

      // Harian → hanya bulan periode; Bulanan → sejak awal tahun buku (YTD).
      let rangeStart = period.startDate;
      const rangeEnd = period.endDate;
      if (granularity === 'bulanan') {
        const fy = await tx.fiscalYear.findUnique({
          where: { id: period.fiscalYearId },
          select: { startDate: true },
        });
        if (fy) rangeStart = fy.startDate;
      }

      if (opts.cabangId) this.cabangScope.assertAccess(opts.cabangId);
      const scope = this.cabangScope.cabangIdsForWhere();

      // Kas awal (di awal rentang) — pakai infrastruktur yang sama dgn statement.
      const result = await aggregateAllAccounts(tx, {
        startDate: rangeStart,
        endDate: rangeEnd,
        cabangId: opts.cabangId,
        allowedCabangIds: scope,
        projectId: opts.projectId,
      });
      let kasAccounts = [...result.accounts.values()].filter((a) => a.isKasSetara);
      if (kasAccounts.length === 0) {
        kasAccounts = [...result.accounts.values()].filter((a) => deriveIsKasSetara(a.kode));
      }
      const kasIds = kasAccounts.map((a) => a.id);
      let kasAwal = new Decimal(0);
      for (const acc of kasAccounts) {
        kasAwal = kasAwal.plus(result.signedSaldoAwalByAcc.get(acc.id) ?? new Decimal(0));
      }

      // Mutasi kas dalam rentang → dikelompokkan per hari/bulan.
      const cabangFilter = opts.cabangId
        ? { cabangId: opts.cabangId }
        : scope
          ? { cabangId: { in: scope } }
          : {};
      const projectFilter =
        opts.projectId === null
          ? { projectId: null }
          : opts.projectId
            ? { projectId: opts.projectId }
            : {};
      const lines = kasIds.length
        ? await tx.journalLine.findMany({
            where: {
              accountId: { in: kasIds },
              ...projectFilter,
              journal: {
                status: { in: JOURNAL_BALANCE_STATUSES },
                tanggal: { gte: rangeStart, lte: rangeEnd },
                ...cabangFilter,
              },
            },
            select: { debit: true, kredit: true, journal: { select: { tanggal: true } } },
          })
        : [];

      const bucketMap = new Map<string, { masuk: Decimal; keluar: Decimal }>();
      for (const l of lines) {
        const iso = l.journal.tanggal.toISOString().slice(0, 10);
        const key = granularity === 'bulanan' ? iso.slice(0, 7) : iso;
        const cur = bucketMap.get(key) ?? { masuk: new Decimal(0), keluar: new Decimal(0) };
        cur.masuk = cur.masuk.plus(l.debit);
        cur.keluar = cur.keluar.plus(l.kredit);
        bucketMap.set(key, cur);
      }

      let running = kasAwal;
      let totalMasuk = new Decimal(0);
      let totalKeluar = new Decimal(0);
      const buckets: ArusKasDetailBucket[] = [...bucketMap.keys()].sort().map((key) => {
        const { masuk, keluar } = bucketMap.get(key)!;
        const bersih = masuk.minus(keluar);
        running = running.plus(bersih);
        totalMasuk = totalMasuk.plus(masuk);
        totalKeluar = totalKeluar.plus(keluar);
        return {
          bucket: key,
          masuk: masuk.toFixed(2),
          keluar: keluar.toFixed(2),
          bersih: bersih.toFixed(2),
          saldoAkhir: running.toFixed(2),
        };
      });

      return {
        granularity,
        periode: { id: period.id, label: period.label, startDate: rangeStart, endDate: rangeEnd },
        kasAwal: kasAwal.toFixed(2),
        totalMasuk: totalMasuk.toFixed(2),
        totalKeluar: totalKeluar.toFixed(2),
        kasAkhir: running.toFixed(2),
        buckets,
      };
    });
  }
}
