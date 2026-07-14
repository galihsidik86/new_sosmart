import { readFileSync } from 'node:fs';
const BASE = process.env.API_BASE || 'http://127.0.0.1:4002/api/v1';
const M = JSON.parse(readFileSync(process.env.MANIFEST_PATH || '/srv/lentera/markplus-manifest.json', 'utf8'));
let TOKEN = null;
async function api(method, path) {
  const headers = { 'content-type': 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (path !== '/auth/login') headers['x-tenant-id'] = M.tenantId;
  const res = await fetch(BASE + path, { method, headers, body: method === 'POST' && path === '/auth/login' ? JSON.stringify(M.login) : undefined });
  const t = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
const f = (n) => Number(n).toLocaleString('id-ID');
const M2 = (n) => (Number(n) / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
let PROBLEMS = 0;
async function main() {
  const login = await api('POST', '/auth/login'); TOKEN = login.accessToken;
  const years = await api('GET', '/periods/years');
  const per = years.find((x) => x.kode === '2026').periods.sort((a, b) => a.no - b.no);
  const B = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];

  console.log('\n=== NERACA (ASET = LIAB + EKUITAS?) ===');
  for (let i = 0; i < 6; i++) {
    const n = await api('GET', `/reports/neraca?periodId=${per[i].id}`);
    if (!n.balanced) PROBLEMS++;
    console.log(`${B[i]} status=${per[i].status.padEnd(6)} balanced=${n.balanced} selisih=${n.selisih} | Aset=${M2(n.totalAset.nilai)} Liab=${M2(n.totalLiabilitas.nilai)} Ekuitas=${M2(n.totalEkuitas.nilai)} (LabaBerjalan=${M2(n.labaBerjalan.nilai)})`);
  }
  console.log('\n=== ARUS KAS (per periode) ===');
  for (let i = 0; i < 6; i++) {
    const a = await api('GET', `/reports/arus-kas?periodId=${per[i].id}&ytd=false`);
    if (!a.balanced) PROBLEMS++;
    console.log(`${B[i]} balanced=${a.balanced} selisih=${a.selisih} | kasAwal=${M2(a.kasAwal)} kasAkhir=${M2(a.kasAkhir)} Δ=${M2(Number(a.kasAkhir) - Number(a.kasAwal))}`);
  }
  console.log('\n=== LABA RUGI (per periode, standalone) ===');
  for (let i = 0; i < 6; i++) {
    const lr = await api('GET', `/reports/laba-rugi?periodId=${per[i].id}`);
    console.log(`${B[i]} Pend=${M2(lr.pendapatan.total)} HPP=${M2(lr.bebanPokok.total)} LabaKotor=${M2(lr.labaKotor.nilai)} BebOps=${M2(lr.bebanOperasi.total)} LabaUsaha=${M2(lr.labaUsaha.nilai)} LabaBersih=${M2(lr.labaBersih.nilai)}`);
  }
  const jun = per[5];
  const ytd = await api('GET', `/reports/laba-rugi?periodId=${jun.id}&ytd=true`);
  console.log('\n=== LABA RUGI YTD (Jan–Jun) ===');
  console.log(`Pendapatan=${f(ytd.pendapatan.total)}\nBeban Pokok Jasa=${f(ytd.bebanPokok.total)}\nLaba Kotor=${f(ytd.labaKotor.nilai)}\nBeban Operasi=${f(ytd.bebanOperasi.total)}\nLaba Usaha=${f(ytd.labaUsaha.nilai)}\nLaba Bersih=${f(ytd.labaBersih.nilai)}`);
  if (Number(ytd.labaBersih.nilai) <= 0) { PROBLEMS++; console.log('⚠ Laba bersih tidak positif'); }

  console.log('\n=== TRIAL BALANCE (Juni) ===');
  const tb = await api('GET', `/trial-balance?periodId=${jun.id}`);
  const rows = tb.rows || tb.accounts || tb.lines || [];
  console.log(`balanced=${tb.balanced} | jml akun=${rows.length}`);
  if (!tb.balanced) PROBLEMS++;
  const kreditContra = ['1-203', '1-205', '1-207'];
  const debitContra = ['3-104', '4-190'];
  const expectDebit = (kode) => debitContra.includes(kode) ? true : kreditContra.includes(kode) ? false : ['1', '5', '6', '8', '9'].includes(kode[0]);
  const D = (r) => Number(r.saldoAkhirDebit || 0), K = (r) => Number(r.saldoAkhirKredit || 0);
  const abn = rows.filter((r) => (expectDebit(r.kode) ? K(r) > 0.5 : D(r) > 0.5));
  console.log('abnormal (saldo di sisi salah):', abn.length ? abn.map((r) => `${r.kode} D=${D(r)} K=${K(r)}`).join(', ') : 'TIDAK ADA ✅');
  if (abn.length) PROBLEMS++;
  const neg = rows.filter((r) => D(r) < -0.5 || K(r) < -0.5);
  console.log('saldo negatif:', neg.length ? neg.map((r) => r.kode).join(', ') : 'TIDAK ADA ✅');
  if (neg.length) PROBLEMS++;
  const byk = {}; for (const r of rows) byk[r.kode] = r;
  console.log('\n  Saldo akun kunci (Juni, D / K):');
  for (const k of ['1-101', '1-1021', '1-1022', '1-1023', '1-103', '1-105', '1-203', '1-205', '1-207', '2-101', '2-1021', '2-1022', '2-201', '3-101', '3-102']) {
    const r = byk[k]; if (r) console.log(`   ${k} ${(r.nama || '').slice(0, 34).padEnd(34)} D=${f(D(r))}  K=${f(K(r))}`);
  }

  console.log('\n=== AR / AP AGING (asOf 2026-06-30) ===');
  for (const [nm, url] of [['AR', '/reports/ar-aging?asOf=2026-06-30'], ['AP', '/reports/ap-aging?asOf=2026-06-30']]) {
    try { const d = await api('GET', url); const total = d.total ?? d.grandTotal ?? d.totalOutstanding ?? (d.rows || d.customers || d.vendors || d.items || []).reduce((a, r) => a + Number(r.total || r.saldo || r.totalOutstanding || 0), 0); console.log(`${nm} outstanding total = ${f(total)} | keys=${Object.keys(d).join(',')}`); } catch (e) { console.log(`${nm} err ${e.message}`); }
  }

  console.log('\n=== BUDGET vs ACTUAL (April) ===');
  try { const ba = await api('GET', `/reports/budget-actual?periode=2026-04`); const rr = ba.rows || ba.lines || []; console.log(`baris=${rr.length} keys=${Object.keys(ba).join(',')}`); rr.slice(0, 4).forEach((r) => console.log('  ', JSON.stringify(r).slice(0, 160))); } catch (e) { console.log('err', e.message); }

  console.log(`\n${PROBLEMS === 0 ? '✅ SEMUA CEK LULUS — TIDAK ADA ANOMALI' : '❌ ADA ' + PROBLEMS + ' MASALAH'}`);
}
main().catch((e) => { console.error('VERIFY FAIL', e.message); process.exit(1); });
