// Smoke test: login + 1 of each transaction type, log real response shapes.
import { readFileSync } from 'node:fs';
const BASE = process.env.API_BASE || 'http://127.0.0.1:4002/api/v1';
const M = JSON.parse(readFileSync(process.env.MANIFEST_PATH || '/srv/lentera/markplus-manifest.json', 'utf8'));
const acc = (k) => M.accounts[k];
let TOKEN = null;

async function api(method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (path !== '/auth/login') headers['x-tenant-id'] = M.tenantId;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text}`);
  return json;
}

const d = (m, day) => `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

async function main() {
  const login = await api('POST', '/auth/login', M.login);
  TOKEN = login.accessToken;
  console.log('LOGIN ok. memberships:', JSON.stringify(login.memberships));

  // periods
  const years = await api('GET', '/periods/years');
  console.log('YEARS shape keys:', Object.keys(years), JSON.stringify(years).slice(0, 300));

  // 1) SALES jasa
  const sInv = await api('POST', '/sales-invoices', {
    cabangId: M.cabang.JKT, customerId: M.customers['CST-002'], tanggal: d(1, 12),
    termin: 'KREDIT', akunArId: acc('1-103'), tarifPpnPersen: 11, hargaTermasukPajak: false,
    deskripsi: 'SMOKE sales', lines: [{
      itemId: M.items['JSA-BHT'], deskripsi: 'Brand Health Tracking Wave 1', qty: '1', satuan: 'Wave',
      hargaSatuan: '300000000', diskonPersen: '0', klasifikasiPpn: 'JKP', isJasa: true,
      akunPendapatanId: acc('4-102'), projectId: M.projects['PRJ-2026-002'].id,
    }],
  });
  console.log('SALES created id:', sInv.id, 'status:', sInv.status);
  const sPosted = await api('POST', `/sales-invoices/${sInv.id}/post`, {});
  const sGet = await api('GET', `/sales-invoices/${sInv.id}`);
  console.log('SALES posted. totalDpp/totalPpn/totalNetto:', sGet.totalDpp, sGet.totalPpn, sGet.totalNetto, 'nomor:', sGet.nomor, 'status:', sGet.status);

  // 2) PURCHASE jasa PKP + PPh23
  const pInv = await api('POST', '/purchase-invoices', {
    cabangId: M.cabang.JKT, vendorId: M.vendors['VEN-001'].id, tanggal: d(1, 14),
    termin: 'KREDIT', akunApId: acc('2-101'), tarifPpnPersen: 11, tarifPph23Persen: 2,
    potongPph23: true, hargaTermasukPajak: false, deskripsi: 'SMOKE purchase fieldwork',
    lines: [{ deskripsi: 'Fieldwork enumerator BHT', qty: '1', satuan: 'Paket', hargaSatuan: '90000000',
      diskonPersen: '0', klasifikasiPpn: 'JKP', isJasa: true, akunDebitId: acc('5-102'),
      projectId: M.projects['PRJ-2026-002'].id }],
  });
  console.log('PURCHASE created id:', pInv.id);
  await api('POST', `/purchase-invoices/${pInv.id}/post`, {});
  const pGet = await api('GET', `/purchase-invoices/${pInv.id}`);
  console.log('PURCHASE posted. totalDpp/totalPpn/totalPph23/totalNetto:', pGet.totalDpp, pGet.totalPpn, pGet.totalPph23, pGet.totalNetto, 'nomor:', pGet.nomor);

  // 3) RECEIPT settle sales
  const rc = await api('POST', '/cash-bank', {
    cabangId: M.cabang.JKT, tipe: 'RECEIPT', tanggal: d(2, 15), akunKasBankId: acc('1-1021'),
    total: sGet.totalNetto, kontak: 'Telkomsel', deskripsi: 'Pelunasan smoke', salesInvoiceId: sInv.id,
    lines: [{ accountId: acc('1-103'), nilai: sGet.totalNetto, deskripsi: 'Pelunasan piutang' }],
  });
  await api('POST', `/cash-bank/${rc.id}/post`, {});
  console.log('RECEIPT posted id:', rc.id);

  // 4) PAYMENT opex (no invoice)
  const pay = await api('POST', '/cash-bank', {
    cabangId: M.cabang.JKT, tipe: 'PAYMENT', tanggal: d(1, 25), akunKasBankId: acc('1-1021'),
    total: '25000000', kontak: 'PLN/Internet', deskripsi: 'Listrik & internet Jan',
    lines: [{ accountId: acc('6-105'), nilai: '25000000', deskripsi: 'Utilitas' }],
  });
  await api('POST', `/cash-bank/${pay.id}/post`, {});
  console.log('PAYMENT posted id:', pay.id);

  // 5) PAYROLL JKT Jan
  const pr = await api('POST', '/payroll/runs', { cabangId: M.cabang.JKT, periode: '2026-01', akunKasBankId: acc('1-1021') });
  console.log('PAYROLL run created id:', pr.id, 'keys:', Object.keys(pr));
  const prPosted = await api('POST', `/payroll/runs/${pr.id}/post`, {});
  const prGet = await api('GET', `/payroll/runs/${pr.id}`);
  console.log('PAYROLL posted. keys:', Object.keys(prGet), 'totals:', JSON.stringify({
    totalBruto: prGet.totalBruto, totalPph21: prGet.totalPph21, totalBpjs: prGet.totalBpjs,
    totalTakeHome: prGet.totalTakeHome, totalPotongan: prGet.totalPotongan, nomor: prGet.nomor,
  }));

  // 6) DEPRECIATION Jan
  const dep = await api('POST', '/depresiasi/run', { periode: '2026-01' });
  console.log('DEPRECIATION run id:', dep.id, 'keys:', Object.keys(dep), 'total:', dep.totalPenyusutan ?? dep.total);

  console.log('\nSMOKE OK ✅');
}
main().catch((e) => { console.error('SMOKE FAIL ❌\n', e.message); process.exit(1); });
