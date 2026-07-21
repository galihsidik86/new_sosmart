import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { AccountKind, NormalBalance } from '@lentera/db';
import {
  computeConsolidation,
  type ConsolidationInput,
  type EntityAccount,
  type EntityMeta,
  type IcSide,
} from '../consolidation.engine.js';

// ---- helper fixtures ----
const acc = (
  kode: string, kind: AccountKind, neraca: number, pl = 0,
  opts: { ic?: boolean; nb?: NormalBalance } = {},
): EntityAccount => ({
  kode, nama: kode, kind,
  normalBalance: opts.nb ?? (kind === AccountKind.ASET || kind.startsWith('BEBAN') ? NormalBalance.DEBIT : NormalBalance.KREDIT),
  klasifikasiNeraca: null,
  isIntercompany: opts.ic ?? false,
  neracaSigned: new Decimal(neraca),
  plSigned: new Decimal(pl),
});

const entity = (tenantId: string, nama: string, pct: number, isParent = false, acq?: { cost: number; net: number }): EntityMeta => ({
  tenantId, nama, ownershipPct: new Decimal(pct), isParent,
  acquisitionCost: acq ? new Decimal(acq.cost) : null,
  acquisitionNetAssets: acq ? new Decimal(acq.net) : null,
});

const noIc = () => ({ receivable: new Map<string, IcSide>(), payable: new Map<string, IcSide>() });

const baseInput = (over: Partial<ConsolidationInput>): ConsolidationInput => ({
  group: { id: 'g1', nama: 'Grup Uji' },
  entities: [],
  perEntity: new Map(),
  perEntityIc: new Map(),
  names: new Map(),
  skipped: [],
  startDate: null,
  endDate: new Date('2026-12-31T23:59:59Z'),
  ...over,
});

describe('computeConsolidation', () => {
  it('Skenario A: dua entitas kepemilikan penuh (100%), tanpa IC → gabung sederhana, balance, NCI=0', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    // Induk: Aset 1000 (Kas), Ekuitas 1000. Anak: Aset 400, Ekuitas 400.
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 1000), acc('3-1', AccountKind.EKUITAS, 1000)]],
      ['A', [acc('1-1', AccountKind.ASET, 400), acc('3-1', AccountKind.EKUITAS, 400)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()]]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc, names: new Map([['P', 'Induk'], ['A', 'Anak A']]) }));

    expect(r.neraca.totalAset).toBe('1400.00');
    expect(r.neraca.totalLiabilitas).toBe('0.00');
    expect(r.neraca.totalEkuitasKonsolidasi).toBe('1400.00');
    expect(r.neraca.kepentinganMinoritas).toBe('0.00');
    expect(r.integritas.neracaBalanced).toBe(true);
    expect(r.integritas.icTerekonsiliasi).toBe(true);
    // per-entitas: baris Aset 1-1 combined 1400 = P:1000 + A:400
    const aset = r.neraca.rows.find((x) => x.kode === '1-1')!;
    expect(aset.combined).toBe('1400.00');
    expect(aset.perEntity).toEqual({ P: '1000.00', A: '400.00' });
  });

  it('Skenario B: kepemilikan sebagian (80%) → NCI = 20% × aset bersih anak', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 80);
    // Anak aset bersih = 500 (Aset 800 − Liab 300). NCI = 20% × 500 = 100.
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 2000), acc('3-1', AccountKind.EKUITAS, 2000)]],
      ['A', [acc('1-1', AccountKind.ASET, 800), acc('2-1', AccountKind.LIABILITAS, 300), acc('3-1', AccountKind.EKUITAS, 500)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()]]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc }));

    expect(r.neraca.kepentinganMinoritas).toBe('100.00');
    // ekuitas induk = total ekuitas kons − NCI
    expect(r.neraca.totalEkuitasKonsolidasi).toBe('2500.00'); // (2000+800)−300
    expect(r.neraca.ekuitasIndukInduk).toBe('2400.00'); // 2500 − 100
    const anak = r.entities.find((e) => e.tenantId === 'A')!;
    expect(anak.netAssets).toBe('500.00');
  });

  it('Skenario C: akun intercompany dieliminasi + rekonsiliasi transaksi cocok', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    // Akun 1-9 (piutang IC) di P = 60, ditandai isIntercompany → eliminasi.
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 1000), acc('1-9', AccountKind.ASET, 60, 0, { ic: true }), acc('3-1', AccountKind.EKUITAS, 1060)]],
      ['A', [acc('1-1', AccountKind.ASET, 200), acc('2-9', AccountKind.LIABILITAS, 60, 0, { ic: true }), acc('3-1', AccountKind.EKUITAS, 140)]],
    ]);
    // IC transaksi: P punya piutang ke A 60; A punya utang ke P 60 → cocok.
    const icSide = (total: number): IcSide => ({ total: new Decimal(total), docs: [] });
    const perEntityIc = new Map([
      ['P', { receivable: new Map([['A', icSide(60)]]), payable: new Map<string, IcSide>() }],
      ['A', { receivable: new Map<string, IcSide>(), payable: new Map([['P', icSide(60)]]) }],
    ]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc, names: new Map([['P', 'Induk'], ['A', 'Anak A']]) }));

    const ic = r.neraca.rows.find((x) => x.kode === '1-9')!;
    expect(ic.isIntercompany).toBe(true);
    expect(ic.combined).toBe('60.00');
    expect(ic.eliminasi).toBe('-60.00');
    expect(ic.konsolidasi).toBe('0.00');
    // rekon transaksi
    expect(r.icRekon).toHaveLength(1);
    expect(r.icRekon[0].selisih).toBe('0.00');
    expect(r.icRekon[0].cocok).toBe(true);
    expect(r.integritas.icTerekonsiliasi).toBe(true);
    expect(r.integritas.totalSelisihIntercompany).toBe('0.00');
  });

  it('Skenario C2: intercompany TIDAK cocok → integritas menandai selisih', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 100), acc('3-1', AccountKind.EKUITAS, 100)]],
      ['A', [acc('1-1', AccountKind.ASET, 50), acc('3-1', AccountKind.EKUITAS, 50)]],
    ]);
    const icSide = (total: number): IcSide => ({ total: new Decimal(total), docs: [] });
    // piutang P→A = 40, tapi utang A→P cuma 35 → selisih 5.
    const perEntityIc = new Map([
      ['P', { receivable: new Map([['A', icSide(40)]]), payable: new Map<string, IcSide>() }],
      ['A', { receivable: new Map<string, IcSide>(), payable: new Map([['P', icSide(35)]]) }],
    ]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc, names: new Map([['P', 'Induk'], ['A', 'Anak A']]) }));

    expect(r.icRekon[0].selisih).toBe('5.00');
    expect(r.icRekon[0].cocok).toBe(false);
    expect(r.integritas.jumlahIcTidakCocok).toBe(1);
    expect(r.integritas.icTerekonsiliasi).toBe(false);
    expect(r.integritas.totalSelisihIntercompany).toBe('5.00');
  });

  it('Skenario D: periode tanpa data → semua nol, balance, tandai entitas tanpa data', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 0)]],
      ['A', [acc('1-1', AccountKind.ASET, 0)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()]]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc, names: new Map([['P', 'Induk'], ['A', 'Anak A']]) }));

    expect(r.neraca.rows).toHaveLength(0);
    expect(r.neraca.totalAset).toBe('0.00');
    expect(r.integritas.neracaBalanced).toBe(true);
    expect(r.integritas.entitasTanpaData).toEqual(['Induk', 'Anak A']);
  });

  it('Skenario E: goodwill (biaya akuisisi > milik% × aset bersih akuisisi)', () => {
    const P = entity('P', 'Induk', 100, true);
    // beli 80% anak seharga 500; aset bersih saat akuisisi 500 → goodwill = 500 − 80%×500 = 100.
    const A = entity('A', 'Anak A', 80, false, { cost: 500, net: 500 });
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 1000), acc('3-1', AccountKind.EKUITAS, 1000)]],
      ['A', [acc('1-1', AccountKind.ASET, 600), acc('3-1', AccountKind.EKUITAS, 600)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()]]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc }));

    expect(r.goodwill.total).toBe('100.00');
    expect(r.goodwill.detail).toEqual([{ nama: 'Anak A', goodwill: '100.00' }]);
    // baris goodwill masuk neraca sebagai aset
    const gw = r.neraca.rows.find((x) => x.kode === 'ZZ-GW')!;
    expect(gw.konsolidasi).toBe('100.00');
    // total aset = 1000 + 600 + 100 goodwill
    expect(r.neraca.totalAset).toBe('1700.00');
  });

  it('Skenario F: entitas belum tutup buku (periode OPEN/CLOSING) ditandai; CLOSED tidak', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    const B = entity('B', 'Anak B', 100);
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 100), acc('3-1', AccountKind.EKUITAS, 100)]],
      ['A', [acc('1-1', AccountKind.ASET, 50), acc('3-1', AccountKind.EKUITAS, 50)]],
      ['B', [acc('1-1', AccountKind.ASET, 30), acc('3-1', AccountKind.EKUITAS, 30)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()], ['B', noIc()]]);
    const entityPeriodStatus = new Map<string, string | null>([
      ['P', 'CLOSED'], ['A', 'OPEN'], ['B', 'CLOSING'],
    ]);
    const r = computeConsolidation(baseInput({
      entities: [P, A, B], perEntity, perEntityIc,
      names: new Map([['P', 'Induk'], ['A', 'Anak A'], ['B', 'Anak B']]),
      entityPeriodStatus,
    }));
    expect(r.integritas.entitasBelumTutupBuku).toEqual([
      { nama: 'Anak A', status: 'OPEN' },
      { nama: 'Anak B', status: 'CLOSING' },
    ]);
    // tanpa map (default) → tak ada yang ditandai (status tak diketahui, jangan false-warning)
    const r2 = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc }));
    expect(r2.integritas.entitasBelumTutupBuku).toEqual([]);
  });

  it('uang presisi: pecahan tidak hilang (0.1 + 0.2)', () => {
    const P = entity('P', 'Induk', 100, true);
    const A = entity('A', 'Anak A', 100);
    const perEntity = new Map<string, EntityAccount[]>([
      ['P', [acc('1-1', AccountKind.ASET, 0.1), acc('3-1', AccountKind.EKUITAS, 0.1)]],
      ['A', [acc('1-1', AccountKind.ASET, 0.2), acc('3-1', AccountKind.EKUITAS, 0.2)]],
    ]);
    const perEntityIc = new Map([['P', noIc()], ['A', noIc()]]);
    const r = computeConsolidation(baseInput({ entities: [P, A], perEntity, perEntityIc }));
    expect(r.neraca.rows.find((x) => x.kode === '1-1')!.combined).toBe('0.30');
  });
});
