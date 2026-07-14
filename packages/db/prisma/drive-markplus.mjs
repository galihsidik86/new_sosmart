/**
 * drive-markplus.mjs — generate 6 bulan transaksi realistis (Jan–Jun 2026)
 * untuk PT MarkPlus Indonesia lewat API engine (semua jurnal divalidasi app).
 *
 * Baca manifest ID dari MANIFEST_PATH. Semua kas operasional lewat Bank BCA
 * (1-1021). Menutup periode Jan–Mei di akhir (Jun+ tetap open).
 *
 * Jalankan: node drive-markplus.mjs
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.API_BASE || 'http://127.0.0.1:4002/api/v1';
const M = JSON.parse(readFileSync(process.env.MANIFEST_PATH || '/srv/lentera/markplus-manifest.json', 'utf8'));

const A = (k) => { const v = M.accounts[k]; if (!v) throw new Error(`akun ${k} tidak ada`); return v; };
const CST = (k) => M.customers[k];
const VEN = (k) => M.vendors[k].id;
const VENPKP = (k) => M.vendors[k].isPkp;
const IT = (k) => M.items[k];
const PRJ = (k) => M.projects[k].id;
const CAB = (k) => M.cabang[k];
const BCA = () => A('1-1021');

let TOKEN = null;
const stats = { sales: 0, purchase: 0, receipt: 0, payment: 0, journal: 0, payroll: 0, deprec: 0, closed: 0 };

async function api(method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (path !== '/auth/login') headers['x-tenant-id'] = M.tenantId;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

const dd = (m, day) => `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const S = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n));
const P2 = (s) => String(s).padStart(2, '0');

// ---- tax accumulators per bulan (1..6)
const ppnKel = {}, ppnMas = {}, pph23 = {}, pph21 = {}, bpjs = {};
for (let m = 1; m <= 6; m++) { ppnKel[m] = 0; ppnMas[m] = 0; pph23[m] = 0; pph21[m] = 0; bpjs[m] = 0; }

const salesDocs = []; // {id, m, netto, cab, cst}
const purchaseDocs = []; // {id, m, netto, cab, ven}

async function createSales({ m, day, cab, cst, item, akun, amt, prj }) {
  const inv = await api('POST', '/sales-invoices', {
    cabangId: CAB(cab), customerId: CST(cst), tanggal: dd(m, day), termin: 'KREDIT',
    akunArId: A('1-103'), tarifPpnPersen: 11, hargaTermasukPajak: false,
    deskripsi: `Faktur jasa — ${item}`,
    lines: [{ itemId: IT(item), deskripsi: `${item}`, qty: '1', satuan: 'Paket',
      hargaSatuan: String(amt), diskonPersen: '0', klasifikasiPpn: 'JKP', isJasa: true,
      akunPendapatanId: A(akun), projectId: prj ? PRJ(prj) : null }],
  });
  await api('POST', `/sales-invoices/${inv.id}/post`, {});
  const g = await api('GET', `/sales-invoices/${inv.id}`);
  ppnKel[m] += Number(g.totalPpn);
  salesDocs.push({ id: inv.id, m, netto: g.totalNetto, cab, cst });
  stats.sales++;
}

async function createPurchase({ m, day, cab, ven, akun, amt, jasa, prj }) {
  const inv = await api('POST', '/purchase-invoices', {
    cabangId: CAB(cab), vendorId: VEN(ven), tanggal: dd(m, day), termin: 'KREDIT',
    akunApId: A('2-101'), tarifPpnPersen: 11, tarifPph23Persen: 2, potongPph23: true,
    hargaTermasukPajak: false, deskripsi: `Tagihan — ${akun}`,
    lines: [{ deskripsi: `Biaya ${akun}`, qty: '1', satuan: 'Paket', hargaSatuan: String(amt),
      diskonPersen: '0', klasifikasiPpn: jasa ? 'JKP' : 'BKP', isJasa: !!jasa,
      akunDebitId: A(akun), projectId: prj ? PRJ(prj) : null }],
  });
  await api('POST', `/purchase-invoices/${inv.id}/post`, {});
  const g = await api('GET', `/purchase-invoices/${inv.id}`);
  ppnMas[m] += Number(g.totalPpn);
  pph23[m] += Number(g.totalPph23);
  purchaseDocs.push({ id: inv.id, m, netto: g.totalNetto, cab, ven });
  stats.purchase++;
}

async function receipt({ m, day, cab, total, kontak, desk, salesInvoiceId, akun }) {
  const e = await api('POST', '/cash-bank', {
    cabangId: CAB(cab), tipe: 'RECEIPT', tanggal: dd(m, day), akunKasBankId: BCA(),
    total: S(total), kontak, deskripsi: desk, salesInvoiceId,
    lines: [{ accountId: A(akun), nilai: S(total), deskripsi: desk }],
  });
  await api('POST', `/cash-bank/${e.id}/post`, {});
  stats.receipt++;
}

async function payment({ m, day, cab, total, kontak, desk, purchaseInvoiceId, lines }) {
  const e = await api('POST', '/cash-bank', {
    cabangId: CAB(cab), tipe: 'PAYMENT', tanggal: dd(m, day), akunKasBankId: BCA(),
    total: S(total), kontak, deskripsi: desk, purchaseInvoiceId,
    lines: lines.map((l) => ({ accountId: A(l.akun), nilai: S(l.nilai), deskripsi: l.desk || desk, projectId: l.prj ? PRJ(l.prj) : null })),
  });
  await api('POST', `/cash-bank/${e.id}/post`, {});
  stats.payment++;
}

async function transfer({ m, day, total, toAkun }) {
  const e = await api('POST', '/cash-bank', {
    cabangId: CAB('JKT'), tipe: 'TRANSFER', tanggal: dd(m, day), akunKasBankId: BCA(),
    akunKasBankLawanId: A(toAkun), total: S(total), kontak: 'Internal', deskripsi: 'Transfer antar bank', lines: [],
  });
  await api('POST', `/cash-bank/${e.id}/post`, {});
  stats.payment++;
}

async function manualJournal({ m, day, cab, desk, lines, sumber = 'PAJAK' }) {
  const j = await api('POST', '/journals', {
    cabangId: CAB(cab), tanggal: dd(m, day), deskripsi: desk, sumber,
    lines: lines.map((l) => ({ accountId: A(l.akun), debit: S(l.debit || 0), kredit: S(l.kredit || 0), deskripsi: l.desk || desk })),
  });
  await api('POST', `/journals/${j.id}/post`, {});
  stats.journal++;
}

async function payroll(cab, m) {
  const run = await api('POST', '/payroll/runs', { cabangId: CAB(cab), periode: `2026-${P2(m)}`, akunKasBankId: BCA() });
  const posted = await api('POST', `/payroll/runs/${run.id}/post`, {});
  const g = await api('GET', `/payroll/runs/${run.id}`);
  pph21[m] += Number(g.totalPph21);
  bpjs[m] += Number(g.totalIuranBpjs);
  stats.payroll++;
}

async function depreciation(m) {
  await api('POST', '/depresiasi/run', { periode: `2026-${P2(m)}` });
  stats.deprec++;
}

// ===================== PLANS =====================
const salesPlan = [
  // Jan
  { m: 1, day: 12, cab: 'JKT', cst: 'CST-002', item: 'JSA-BHT', akun: '4-102', amt: 300_000_000, prj: 'PRJ-2026-002' },
  { m: 1, day: 20, cab: 'JKT', cst: 'CST-001', item: 'JSA-ADVIS', akun: '4-101', amt: 250_000_000, prj: 'PRJ-2026-001' },
  // Feb
  { m: 2, day: 10, cab: 'JKT', cst: 'CST-005', item: 'JSA-TRINH', akun: '4-103', amt: 120_000_000, prj: 'PRJ-2026-007' },
  { m: 2, day: 22, cab: 'JKT', cst: 'CST-001', item: 'JSA-ADVIS', akun: '4-101', amt: 250_000_000, prj: 'PRJ-2026-001' },
  // Mar
  { m: 3, day: 8, cab: 'JKT', cst: 'CST-003', item: 'JSA-UAA', akun: '4-102', amt: 200_000_000, prj: 'PRJ-2026-003' },
  { m: 3, day: 15, cab: 'JKT', cst: 'CST-006', item: 'JSA-CSAT', akun: '4-102', amt: 250_000_000, prj: 'PRJ-2026-004' },
  { m: 3, day: 25, cab: 'JKT', cst: 'CST-005', item: 'JSA-TRINH', akun: '4-103', amt: 120_000_000, prj: 'PRJ-2026-007' },
  // Apr
  { m: 4, day: 7, cab: 'JKT', cst: 'CST-002', item: 'JSA-BHT', akun: '4-102', amt: 300_000_000, prj: 'PRJ-2026-002' },
  { m: 4, day: 14, cab: 'JKT', cst: 'CST-004', item: 'JSA-FEAS', akun: '4-102', amt: 200_000_000, prj: 'PRJ-2026-005' },
  { m: 4, day: 18, cab: 'JKT', cst: 'CST-005', item: 'JSA-EVENT', akun: '4-104', amt: 250_000_000, prj: 'PRJ-2026-006' },
  { m: 4, day: 26, cab: 'JKT', cst: 'CST-007', item: 'JSA-CONS', akun: '4-101', amt: 275_000_000, prj: 'PRJ-2026-008' },
  // May
  { m: 5, day: 9, cab: 'JKT', cst: 'CST-003', item: 'JSA-UAA', akun: '4-102', amt: 250_000_000, prj: 'PRJ-2026-003' },
  { m: 5, day: 16, cab: 'JKT', cst: 'CST-011', item: 'JSA-EVENT', akun: '4-104', amt: 250_000_000, prj: 'PRJ-2026-006' },
  { m: 5, day: 27, cab: 'JKT', cst: 'CST-001', item: 'JSA-ADVIS', akun: '4-101', amt: 300_000_000, prj: 'PRJ-2026-001' },
  // Jun
  { m: 6, day: 6, cab: 'JKT', cst: 'CST-006', item: 'JSA-CSAT', akun: '4-102', amt: 250_000_000, prj: 'PRJ-2026-004' },
  { m: 6, day: 13, cab: 'JKT', cst: 'CST-004', item: 'JSA-FEAS', akun: '4-102', amt: 200_000_000, prj: 'PRJ-2026-005' },
  { m: 6, day: 19, cab: 'JKT', cst: 'CST-012', item: 'JSA-EVENT', akun: '4-104', amt: 250_000_000, prj: 'PRJ-2026-006' },
  { m: 6, day: 24, cab: 'JKT', cst: 'CST-007', item: 'JSA-CONS', akun: '4-101', amt: 275_000_000, prj: 'PRJ-2026-008' },
  // Tambahan pendapatan (klien besar, tanpa proyek riset khusus — margin tinggi)
  { m: 1, day: 22, cab: 'JKT', cst: 'CST-013', item: 'JSA-CONS', akun: '4-101', amt: 300_000_000 },
  { m: 2, day: 8, cab: 'JKT', cst: 'CST-006', item: 'JSA-ADVIS', akun: '4-101', amt: 300_000_000 },
  { m: 2, day: 24, cab: 'JKT', cst: 'CST-009', item: 'JSA-UAA', akun: '4-102', amt: 250_000_000 },
  { m: 3, day: 20, cab: 'JKT', cst: 'CST-008', item: 'JSA-FEAS', akun: '4-102', amt: 300_000_000 },
  { m: 5, day: 22, cab: 'BDG', cst: 'CST-015', item: 'JSA-CSAT', akun: '4-102', amt: 200_000_000 },
];
// Recurring training publik + media Marketeers tiap bulan (rotasi cabang & customer)
const recurCab = ['JKT', 'SBY', 'BDG'];
const recurTrainCst = ['CST-009', 'CST-013', 'CST-014', 'CST-010', 'CST-015', 'CST-008'];
const recurMediaCst = ['CST-015', 'CST-011', 'CST-009', 'CST-012', 'CST-014', 'CST-013'];
for (let m = 1; m <= 6; m++) {
  salesPlan.push({ m, day: 5, cab: recurCab[(m - 1) % 3], cst: recurTrainCst[(m - 1) % recurTrainCst.length], item: 'JSA-TRPUB', akun: '4-103', amt: 110_000_000 });
  salesPlan.push({ m, day: 11, cab: 'JKT', cst: recurMediaCst[(m - 1) % recurMediaCst.length], item: 'JSA-MEDIA', akun: '4-105', amt: 70_000_000 });
}

const purchasePlan = [
  // project direct costs
  { m: 1, day: 15, cab: 'JKT', ven: 'VEN-001', akun: '5-102', amt: 80_000_000, jasa: true, prj: 'PRJ-2026-002' },
  { m: 1, day: 18, cab: 'JKT', ven: 'VEN-003', akun: '5-101', amt: 60_000_000, jasa: true, prj: 'PRJ-2026-001' },
  { m: 2, day: 14, cab: 'JKT', ven: 'VEN-001', akun: '5-102', amt: 80_000_000, jasa: true, prj: 'PRJ-2026-002' },
  { m: 2, day: 17, cab: 'JKT', ven: 'VEN-003', akun: '5-101', amt: 30_000_000, jasa: true, prj: 'PRJ-2026-007' },
  { m: 2, day: 20, cab: 'JKT', ven: 'VEN-011', akun: '6-105', amt: 30_000_000, jasa: true },
  { m: 3, day: 6, cab: 'SBY', ven: 'VEN-002', akun: '5-102', amt: 65_000_000, jasa: true, prj: 'PRJ-2026-003' },
  { m: 3, day: 12, cab: 'JKT', ven: 'VEN-001', akun: '5-102', amt: 55_000_000, jasa: true, prj: 'PRJ-2026-004' },
  { m: 3, day: 16, cab: 'JKT', ven: 'VEN-003', akun: '5-101', amt: 45_000_000, jasa: true, prj: 'PRJ-2026-005' },
  { m: 3, day: 22, cab: 'JKT', ven: 'VEN-008', akun: '6-110', amt: 120_000_000, jasa: true }, // audit tahunan
  { m: 4, day: 10, cab: 'JKT', ven: 'VEN-001', akun: '5-102', amt: 85_000_000, jasa: true, prj: 'PRJ-2026-002' },
  { m: 4, day: 15, cab: 'JKT', ven: 'VEN-005', akun: '5-103', amt: 110_000_000, jasa: false, prj: 'PRJ-2026-006' },
  { m: 4, day: 16, cab: 'JKT', ven: 'VEN-006', akun: '5-103', amt: 60_000_000, jasa: true, prj: 'PRJ-2026-006' },
  { m: 4, day: 21, cab: 'JKT', ven: 'VEN-004', akun: '5-105', amt: 40_000_000, jasa: true, prj: 'PRJ-2026-008' },
  { m: 4, day: 24, cab: 'JKT', ven: 'VEN-009', akun: '6-110', amt: 35_000_000, jasa: true },
  { m: 5, day: 8, cab: 'SBY', ven: 'VEN-002', akun: '5-102', amt: 65_000_000, jasa: true, prj: 'PRJ-2026-003' },
  { m: 5, day: 14, cab: 'JKT', ven: 'VEN-005', akun: '5-103', amt: 100_000_000, jasa: false, prj: 'PRJ-2026-006' },
  { m: 5, day: 20, cab: 'JKT', ven: 'VEN-007', akun: '5-104', amt: 45_000_000, jasa: false },
  { m: 6, day: 9, cab: 'JKT', ven: 'VEN-001', akun: '5-102', amt: 55_000_000, jasa: true, prj: 'PRJ-2026-004' },
  { m: 6, day: 13, cab: 'JKT', ven: 'VEN-003', akun: '5-101', amt: 45_000_000, jasa: true, prj: 'PRJ-2026-005' },
  { m: 6, day: 18, cab: 'JKT', ven: 'VEN-004', akun: '5-105', amt: 40_000_000, jasa: true, prj: 'PRJ-2026-008' },
];

async function main() {
  console.log('🔑 login...');
  const login = await api('POST', '/auth/login', M.login);
  TOKEN = login.accessToken;
  console.log(`  ok sebagai ${M.login.email}`);

  // 1) FAKTUR PENJUALAN
  console.log('🧾 faktur penjualan...');
  for (const s of salesPlan) await createSales(s);
  // 2) FAKTUR PEMBELIAN
  console.log('🧾 faktur pembelian...');
  for (const p of purchasePlan) await createPurchase(p);

  // 3) PAYROLL (3 cabang × 6 bln) + 4) PENYUSUTAN (6 bln)
  console.log('👥 payroll + 📉 penyusutan...');
  for (let m = 1; m <= 6; m++) {
    for (const cab of ['JKT', 'SBY', 'BDG']) await payroll(cab, m);
    await depreciation(m);
  }

  // 5) OPEX rutin per bulan (via BCA)
  console.log('💸 opex rutin...');
  for (let m = 1; m <= 6; m++) {
    await payment({ m, day: 2, cab: 'JKT', total: 150_000_000, kontak: 'PT Properti Kasablanka', desk: 'Sewa kantor bulanan', lines: [{ akun: '6-102', nilai: 150_000_000 }] });
    await payment({ m, day: 3, cab: 'JKT', total: 25_000_000, kontak: 'PLN/PDAM/ISP', desk: 'Listrik, air & internet', lines: [{ akun: '6-105', nilai: 25_000_000 }] });
    await payment({ m, day: 4, cab: 'JKT', total: 40_000_000, kontak: 'Digital & Media', desk: 'Pemasaran & promosi', lines: [{ akun: '6-104', nilai: 40_000_000 }] });
    await payment({ m, day: 6, cab: 'JKT', total: 30_000_000, kontak: 'Travel', desk: 'Perjalanan dinas', lines: [{ akun: '6-107', nilai: 30_000_000 }] });
    await payment({ m, day: 7, cab: 'JKT', total: 20_000_000, kontak: 'Umum', desk: 'Administrasi & umum', lines: [{ akun: '6-106', nilai: 20_000_000 }] });
    await payment({ m, day: 8, cab: 'JKT', total: 26_000_000, kontak: 'Bank (Kredit Investasi)', desk: 'Angsuran pinjaman bank', lines: [{ akun: '8-101', nilai: 6_000_000, desk: 'Bunga' }, { akun: '2-201', nilai: 20_000_000, desk: 'Pokok' }] });
    await payment({ m, day: 28, cab: 'JKT', total: 1_500_000, kontak: 'Bank', desk: 'Biaya administrasi bank', lines: [{ akun: '8-102', nilai: 1_500_000 }] });
    await payment({ m, day: 10, cab: 'JKT', total: 12_000_000, kontak: 'Kas Negara', desk: 'Angsuran PPh 25', lines: [{ akun: '1-107', nilai: 12_000_000 }] });
    await receipt({ m, day: 27, cab: 'JKT', total: 3_500_000, kontak: 'Bank', desk: 'Jasa giro / bunga bank', akun: '7-101' });
  }

  // 6) TRANSFER antar bank (realisme)
  await transfer({ m: 2, day: 5, total: 150_000_000, toAkun: '1-1022' });
  await transfer({ m: 4, day: 5, total: 100_000_000, toAkun: '1-1023' });

  // 7) PELUNASAN PIUTANG (collect m<=4 full; m=5 sebagian → sisakan AR untuk aging; m=6 outstanding)
  console.log('💰 pelunasan piutang...');
  let i = 0;
  for (const s of salesDocs) {
    i++;
    const collect = s.m <= 4 || (s.m === 5 && i % 2 === 0);
    if (!collect) continue;
    const cm = Math.min(s.m + 1, 6);
    await receipt({ m: cm, day: 15, cab: s.cab, total: s.netto, kontak: 'Pelunasan pelanggan', desk: `Pelunasan faktur`, salesInvoiceId: s.id, akun: '1-103' });
  }

  // 8) PEMBAYARAN UTANG (pay m<=4 full; m=5 sebagian; m=6 outstanding)
  console.log('💳 pembayaran utang vendor...');
  let j = 0;
  for (const p of purchaseDocs) {
    j++;
    const pay = p.m <= 4 || (p.m === 5 && j % 2 === 0);
    if (!pay) continue;
    const pm = Math.min(p.m + 1, 6);
    await payment({ m: pm, day: 20, cab: p.cab, total: p.netto, kontak: 'Pembayaran vendor', desk: 'Pelunasan utang usaha', purchaseInvoiceId: p.id, lines: [{ akun: '2-101', nilai: p.netto }] });
  }

  // 9) SETOR PAJAK bulan m disetor bulan m+1 (Jan–Mei → Feb–Jun)
  console.log('🏛️ setor pajak...');
  for (let m = 1; m <= 5; m++) {
    const rm = m + 1;
    // PPN: net = keluaran − masukan (netting via jurnal manual: D keluaran / K masukan / K bank)
    const net = Math.round(ppnKel[m] - ppnMas[m]);
    if (net > 0) {
      await manualJournal({
        m: rm, day: 10, cab: 'JKT', desk: `Setor PPN Masa ${P2(m)}/2026`,
        lines: [
          { akun: '2-1021', debit: ppnKel[m], desk: 'PPN Keluaran masa' },
          { akun: '1-105', kredit: ppnMas[m], desk: 'Kompensasi PPN Masukan' },
          { akun: '1-1021', kredit: net, desk: 'Setor PPN kurang bayar' },
        ],
      });
    }
    if (pph23[m] > 0) await payment({ m: rm, day: 10, cab: 'JKT', total: pph23[m], kontak: 'Kas Negara', desk: `Setor PPh 23 masa ${P2(m)}`, lines: [{ akun: '2-1023', nilai: pph23[m] }] });
    if (pph21[m] > 0) await payment({ m: rm, day: 10, cab: 'JKT', total: pph21[m], kontak: 'Kas Negara', desk: `Setor PPh 21 masa ${P2(m)}`, lines: [{ akun: '2-1022', nilai: pph21[m] }] });
    if (bpjs[m] > 0) await payment({ m: rm, day: 11, cab: 'JKT', total: bpjs[m], kontak: 'BPJS', desk: `Setor iuran BPJS masa ${P2(m)}`, lines: [{ akun: '2-106', nilai: bpjs[m] }] });
  }

  // 10) TUTUP PERIODE Jan–Mei (chain order)
  console.log('🔒 tutup periode Jan–Mei...');
  const years = await api('GET', '/periods/years');
  const y2026 = years.find((y) => y.kode === '2026');
  const periods = (y2026.periods || []).sort((a, b) => a.no - b.no);
  for (let no = 1; no <= 5; no++) {
    const per = periods.find((p) => p.no === no);
    if (per && per.status !== 'CLOSED') {
      await api('POST', '/periods/close', { periodId: per.id, catatan: `Tutup buku ${per.label}` });
      stats.closed++;
    }
  }

  console.log('\n✅ DRIVER SELESAI');
  console.log(JSON.stringify(stats, null, 2));
  console.log('Pajak per bulan (untuk audit):', JSON.stringify({ ppnKel, ppnMas, pph23, pph21, bpjs }, (k, v) => typeof v === 'number' ? Math.round(v) : v));
}
main().catch((e) => { console.error('\n❌ DRIVER GAGAL\n', e.message); process.exit(1); });
