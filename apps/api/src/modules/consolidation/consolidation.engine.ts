/**
 * Mesin konsolidasi — FUNGSI MURNI (tanpa Prisma / tanpa RLS).
 *
 * Semua perhitungan konsolidasi (agregasi lintas entitas → eliminasi
 * intercompany → NCI → goodwill → validasi) ada di sini supaya bisa di-unit-test
 * deterministik. Service (consolidation.service.ts) hanya membaca balances tiap
 * entitas dalam konteks RLS-nya, lalu memanggil `computeConsolidation`.
 *
 * Uang pakai decimal.js; pembulatan hanya di titik output (`.toFixed(2)`).
 */
import { Decimal } from 'decimal.js';
import { AccountKind, NormalBalance } from '@lentera/db';

export interface IcDoc {
  nomor: string | null;
  tanggal: Date;
  kontak: string;
  netto: string;
  dibayar: string;
  outstanding: string;
}
export interface IcSide {
  total: Decimal;
  docs: IcDoc[];
}

export interface EntityAccount {
  kode: string;
  nama: string;
  kind: AccountKind;
  normalBalance: NormalBalance;
  klasifikasiNeraca: string | null;
  isIntercompany: boolean;
  /** Saldo akhir signed (normal-positif) s/d endDate — untuk Neraca. */
  neracaSigned: Decimal;
  /** Mutasi signed dalam rentang [startDate,endDate] — untuk Laba Rugi. */
  plSigned: Decimal;
}

export interface EntityMeta {
  tenantId: string;
  nama: string;
  ownershipPct: Decimal;
  isParent: boolean;
  acquisitionCost: Decimal | null;
  acquisitionNetAssets: Decimal | null;
}

export interface ConsolidationInput {
  group: { id: string; nama: string };
  entities: EntityMeta[];
  perEntity: Map<string, EntityAccount[]>;
  perEntityIc: Map<string, { receivable: Map<string, IcSide>; payable: Map<string, IcSide> }>;
  names: Map<string, string>;
  skipped: string[];
  startDate: Date | null;
  endDate: Date;
}

const isPLKind = (k: AccountKind): boolean =>
  k === AccountKind.PENDAPATAN || k === AccountKind.PENDAPATAN_LAIN ||
  k === AccountKind.BEBAN || k === AccountKind.BEBAN_POKOK || k === AccountKind.BEBAN_LAIN;

const isPendapatanKind = (k: AccountKind): boolean =>
  k === AccountKind.PENDAPATAN || k === AccountKind.PENDAPATAN_LAIN;

/** Kontribusi akun ke seksi Neraca (kontra dibalik supaya mengurangi). */
export function neracaContribution(a: EntityAccount): Decimal {
  const expected = a.kind === AccountKind.ASET ? NormalBalance.DEBIT : NormalBalance.KREDIT;
  return a.normalBalance === expected ? a.neracaSigned : a.neracaSigned.negated();
}

/** Kontribusi akun ke Laba Rugi (pendapatan/beban positif ke arah masing-masing). */
export function plContribution(a: EntityAccount): Decimal {
  const expected = isPendapatanKind(a.kind) ? NormalBalance.KREDIT : NormalBalance.DEBIT;
  return a.normalBalance === expected ? a.plSigned : a.plSigned.negated();
}

const TOLERANSI = new Decimal('0.5');

export function computeConsolidation(input: ConsolidationInput) {
  const { group, entities, perEntity, perEntityIc, names, skipped, startDate, endDate } = input;
  const groupTenantSet = new Set(entities.map((e) => e.tenantId));
  const nameOf = (id: string) => names.get(id) ?? id;

  // ---- 1. Agregasi per kode akun + rincian per entitas ----
  interface Row {
    kode: string; nama: string; kind: AccountKind; klasifikasi: string | null;
    isIntercompany: boolean; combined: Decimal; perEntity: Map<string, Decimal>;
  }
  const neracaByKode = new Map<string, Row>();
  const plByKode = new Map<string, Row>();
  for (const e of entities) {
    for (const a of perEntity.get(e.tenantId) ?? []) {
      const isPL = isPLKind(a.kind);
      const target = isPL ? plByKode : neracaByKode;
      const nilai = isPL ? plContribution(a) : neracaContribution(a);
      const cur = target.get(a.kode) ?? {
        kode: a.kode, nama: a.nama, kind: a.kind, klasifikasi: a.klasifikasiNeraca,
        isIntercompany: a.isIntercompany, combined: new Decimal(0), perEntity: new Map<string, Decimal>(),
      };
      cur.combined = cur.combined.plus(nilai);
      cur.perEntity.set(e.tenantId, (cur.perEntity.get(e.tenantId) ?? new Decimal(0)).plus(nilai));
      cur.isIntercompany = cur.isIntercompany || a.isIntercompany;
      target.set(a.kode, cur);
    }
  }

  const mkRows = (m: Map<string, Row>) =>
    [...m.values()]
      .filter((r) => !r.combined.eq(0) || r.isIntercompany)
      .sort((a, b) => a.kode.localeCompare(b.kode))
      .map((r) => ({
        kode: r.kode, nama: r.nama, kind: r.kind, klasifikasi: r.klasifikasi,
        isIntercompany: r.isIntercompany,
        combined: r.combined.toFixed(2),
        eliminasi: (r.isIntercompany ? r.combined.negated() : new Decimal(0)).toFixed(2),
        konsolidasi: (r.isIntercompany ? new Decimal(0) : r.combined).toFixed(2),
        // Kertas kerja per-entitas: {tenantId → nilai} (hanya entitas yang punya nilai).
        perEntity: Object.fromEntries(
          [...r.perEntity.entries()].filter(([, v]) => !v.eq(0)).map(([id, v]) => [id, v.toFixed(2)]),
        ) as Record<string, string>,
      }));

  const neracaRows = mkRows(neracaByKode);
  const plRows = mkRows(plByKode);

  // ---- 2. Goodwill (metode akuisisi) = biaya perolehan − milik% × aset bersih akuisisi ----
  let totalGoodwill = new Decimal(0);
  const goodwillDetail: Array<{ nama: string; goodwill: string }> = [];
  for (const e of entities) {
    if (e.isParent) continue;
    if (e.acquisitionCost != null && e.acquisitionNetAssets != null) {
      const gw = e.acquisitionCost.minus(e.acquisitionNetAssets.times(e.ownershipPct).div(100));
      totalGoodwill = totalGoodwill.plus(gw);
      goodwillDetail.push({ nama: e.nama, goodwill: gw.toFixed(2) });
    }
  }
  if (!totalGoodwill.eq(0)) {
    neracaRows.push({
      kode: 'ZZ-GW', nama: 'Goodwill (konsolidasi)', kind: AccountKind.ASET,
      klasifikasi: 'ASET_TETAP', isIntercompany: false,
      combined: totalGoodwill.toFixed(2), eliminasi: '0.00', konsolidasi: totalGoodwill.toFixed(2),
      perEntity: {},
    });
  }

  // ---- 3. Total Neraca (setelah eliminasi IC akun + goodwill) ----
  const sumKons = (rows: typeof neracaRows, pred: (r: (typeof neracaRows)[number]) => boolean) =>
    rows.filter(pred).reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));
  const totalAset = sumKons(neracaRows, (r) => r.kind === AccountKind.ASET);
  const totalLiab = sumKons(neracaRows, (r) => r.kind === AccountKind.LIABILITAS);
  const totalEkuitasKons = totalAset.minus(totalLiab); // identitas neraca (incl goodwill)
  const ekuitasAkunKons = sumKons(neracaRows, (r) => r.kind === AccountKind.EKUITAS);

  // ---- 4. Laba Rugi konsolidasi ----
  const pendapatan = plRows.filter((r) => isPendapatanKind(r.kind))
    .reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));
  const beban = plRows.filter((r) => !isPendapatanKind(r.kind))
    .reduce((a, r) => a.plus(new Decimal(r.konsolidasi)), new Decimal(0));
  const labaBersihKons = pendapatan.minus(beban);
  const eliminasiEkuitas = totalEkuitasKons.minus(ekuitasAkunKons).minus(labaBersihKons);

  // ---- 5. Kepentingan minoritas (NCI) + detail per entitas ----
  let nci = new Decimal(0);
  let labaNci = new Decimal(0);
  const entityDetail = entities.map((e) => {
    const accts = perEntity.get(e.tenantId) ?? [];
    const aset = accts.filter((a) => a.kind === AccountKind.ASET)
      .reduce((s, a) => s.plus(neracaContribution(a)), new Decimal(0));
    const liab = accts.filter((a) => a.kind === AccountKind.LIABILITAS)
      .reduce((s, a) => s.plus(neracaContribution(a)), new Decimal(0));
    const netAssets = aset.minus(liab);
    const inc = accts.reduce((s, a) => {
      if (!isPLKind(a.kind)) return s;
      const c = plContribution(a);
      return isPendapatanKind(a.kind) ? s.plus(c) : s.minus(c);
    }, new Decimal(0));
    const minoritas = new Decimal(100).minus(e.ownershipPct).div(100);
    if (!e.isParent) {
      nci = nci.plus(netAssets.times(minoritas));
      labaNci = labaNci.plus(inc.times(minoritas));
    }
    // Jumlah baris akun berkontribusi — dipakai deteksi "entitas tanpa data".
    const jumlahAkun = accts.filter((a) => !a.neracaSigned.eq(0) || !a.plSigned.eq(0)).length;
    return {
      tenantId: e.tenantId, nama: e.nama, ownershipPct: e.ownershipPct.toFixed(2),
      isParent: e.isParent, netAssets: netAssets.toFixed(2), netIncome: inc.toFixed(2),
      jumlahAkun,
    };
  });

  // ---- 6. Rekonsiliasi intercompany level-transaksi (piutang E→P vs utang P→E) ----
  const emptySide: IcSide = { total: new Decimal(0), docs: [] };
  const icRekon: Array<{
    dari: string; ke: string; piutang: string; utangLawan: string; selisih: string; cocok: boolean;
    piutangDocs: IcDoc[]; utangDocs: IcDoc[];
  }> = [];
  let totalSelisihIc = new Decimal(0);
  let icTidakCocok = 0;
  for (const e of entities) {
    for (const [partnerId, side] of perEntityIc.get(e.tenantId)?.receivable ?? []) {
      if (!groupTenantSet.has(partnerId)) continue;
      const partnerSide = perEntityIc.get(partnerId)?.payable.get(e.tenantId) ?? emptySide;
      const d = side.total.minus(partnerSide.total);
      const cocok = d.abs().lte(TOLERANSI);
      if (!cocok) icTidakCocok++;
      totalSelisihIc = totalSelisihIc.plus(d.abs());
      icRekon.push({
        dari: e.nama, ke: nameOf(partnerId),
        piutang: side.total.toFixed(2), utangLawan: partnerSide.total.toFixed(2),
        selisih: d.toFixed(2), cocok,
        piutangDocs: side.docs, utangDocs: partnerSide.docs,
      });
    }
  }

  const ekuitasInduk = totalEkuitasKons.minus(nci);
  const labaInduk = labaBersihKons.minus(labaNci);

  // ---- 7. Validasi ----
  // Neraca: Aset = Liab + Ekuitas (strukturnya ~0 karena ekuitas diturunkan A−L).
  const selisihNeraca = totalAset.minus(totalLiab.plus(totalEkuitasKons));
  // Sinyal integritas SEJATI = rekonsiliasi intercompany (piutang IC harus = utang lawan).
  const entitasTanpaData = entityDetail.filter((e) => e.jumlahAkun === 0).map((e) => e.nama);

  return {
    group: { id: group.id, nama: group.nama },
    periode: { startDate: startDate ?? null, endDate },
    entities: entityDetail,
    skippedTenantIds: skipped,
    goodwill: { total: totalGoodwill.toFixed(2), detail: goodwillDetail },
    icRekon,
    neraca: {
      rows: neracaRows,
      totalAset: totalAset.toFixed(2),
      totalLiabilitas: totalLiab.toFixed(2),
      totalEkuitasKonsolidasi: totalEkuitasKons.toFixed(2),
      eliminasiEkuitasAkuisisi: eliminasiEkuitas.toFixed(2),
      ekuitasIndukInduk: ekuitasInduk.toFixed(2),
      kepentinganMinoritas: nci.toFixed(2),
    },
    labaRugi: {
      rows: plRows,
      pendapatan: pendapatan.toFixed(2),
      beban: beban.toFixed(2),
      labaBersihKonsolidasi: labaBersihKons.toFixed(2),
      labaIndukInduk: labaInduk.toFixed(2),
      labaMinoritas: labaNci.toFixed(2),
    },
    // Blok integritas eksplisit (dipakai UI Tahap 2 untuk peringatan keras).
    integritas: {
      selisihNeraca: selisihNeraca.toFixed(2),
      neracaBalanced: selisihNeraca.abs().lte(TOLERANSI),
      totalSelisihIntercompany: totalSelisihIc.toFixed(2),
      jumlahIcTidakCocok: icTidakCocok,
      icTerekonsiliasi: icTidakCocok === 0,
      entitasTanpaData,
    },
    // Kompat lama.
    balanced: selisihNeraca.abs().lte(TOLERANSI),
    selisih: selisihNeraca.toFixed(2),
  };
}

export type ConsolidationResult = ReturnType<typeof computeConsolidation>;
