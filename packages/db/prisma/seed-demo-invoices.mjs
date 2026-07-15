/**
 * Buat + post faktur penjualan/pembelian RIIL di anak perusahaan lewat API
 * (service asli → jurnal auto konsisten). Jalankan SETELAH seed-demo.ts.
 *   node packages/db/prisma/seed-demo-invoices.mjs
 * Idempotent: pakai idempotencyKey tetap (create tidak dobel; post yg sudah
 * POSTED diabaikan).
 */
const API = process.env.API_URL || 'http://127.0.0.1:4002/api/v1';
const INST = '11111111-1111-1111-1111-111111111111';
const OMG = '22222222-2222-2222-2222-222222222222';

async function api(path, { method = 'GET', token, tenant, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

let uid = 0;
const key = () => `a0000000-0000-0000-0000-00000000000${(++uid).toString(16)}`;

const MP = '9e648607-436f-4aaf-aabd-f0abdd80100c';
const SUBS = [
  {
    tenant: INST, nama: 'Marketeers', icCust: 'IC-MKT', icPiutang: 60000000, icUtang: 60000000,
    sales: [
      { cust: 'CUST-01', amt: 150000000, pend: '4-102', desc: 'Paket iklan majalah Marketeers edisi Juni' },
      { cust: 'CUST-02', amt: 90000000, pend: '4-102', desc: 'Konten bersponsor & media placement' },
    ],
    purch: [
      { vend: 'VEND-01', amt: 40000000, akun: '5-101', desc: 'Cetak majalah edisi Juni' },
      { vend: 'VEND-02', amt: 25000000, akun: '6-104', desc: 'Jasa desain kreatif kampanye' },
    ],
  },
  {
    tenant: OMG, nama: 'MarkPlus Inspirasi Indonesia', icCust: 'IC-INSP', icPiutang: 40000000, icUtang: 35000000,
    sales: [
      { cust: 'CUST-01', amt: 100000000, pend: '4-101', desc: 'Pelatihan leadership korporat' },
      { cust: 'CUST-02', amt: 80000000, pend: '4-101', desc: 'Workshop transformasi digital' },
    ],
    purch: [
      { vend: 'VEND-01', amt: 30000000, akun: '6-102', desc: 'Sewa venue pelatihan Juni' },
      { vend: 'VEND-02', amt: 15000000, akun: '6-106', desc: 'Katering peserta pelatihan' },
    ],
  },
];

async function main() {
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: 'demo@markplusindonesia.co.id', password: 'markplus123' },
  });
  const token = login.data.accessToken;
  if (!token) throw new Error('login gagal: ' + JSON.stringify(login.data));

  for (const s of SUBS) {
    const accts = (await api('/accounts?view=flat', { token, tenant: s.tenant })).data;
    const byKode = Object.fromEntries(accts.map((a) => [a.kode, a.id]));
    const custs = (await api('/customers', { token, tenant: s.tenant })).data;
    const custByKode = Object.fromEntries(custs.map((c) => [c.kode, c.id]));
    const vends = (await api('/vendors', { token, tenant: s.tenant })).data;
    const vendByKode = Object.fromEntries(vends.map((v) => [v.kode, v.id]));
    const cabang = (await api('/cabang', { token, tenant: s.tenant })).data[0].id;

    for (const sale of s.sales) {
      const body = {
        cabangId: cabang, customerId: custByKode[sale.cust], tanggal: '2026-06-15', termin: 'KREDIT',
        akunArId: byKode['1-103'], idempotencyKey: key(),
        lines: [{ itemId: null, deskripsi: sale.desc, qty: '1', satuan: 'Job', hargaSatuan: String(sale.amt), diskonPersen: '0', klasifikasiPpn: 'NON_BKP', isJasa: false, akunPendapatanId: byKode[sale.pend] }],
      };
      const inv = await api('/sales-invoices', { method: 'POST', token, tenant: s.tenant, body });
      if (inv.data?.id) {
        const p = await api(`/sales-invoices/${inv.data.id}/post`, { method: 'POST', token, tenant: s.tenant, body: {} });
        console.log(`  ${s.nama} SALE ${sale.desc}: ${p.ok ? 'posted' : p.data?.message || p.status}`);
      } else console.log(`  ${s.nama} SALE create gagal:`, inv.data?.message || inv.status);
    }
    for (const pu of s.purch) {
      const body = {
        cabangId: cabang, vendorId: vendByKode[pu.vend], tanggal: '2026-06-16', termin: 'KREDIT',
        akunApId: byKode['2-101'], tarifPph23Persen: 0, potongPph23: false, idempotencyKey: key(),
        lines: [{ itemId: null, deskripsi: pu.desc, qty: '1', satuan: 'Job', hargaSatuan: String(pu.amt), diskonPersen: '0', klasifikasiPpn: 'NON_BKP', isJasa: false, akunDebitId: byKode[pu.akun] }],
      };
      const inv = await api('/purchase-invoices', { method: 'POST', token, tenant: s.tenant, body });
      if (inv.data?.id) {
        const p = await api(`/purchase-invoices/${inv.data.id}/post`, { method: 'POST', token, tenant: s.tenant, body: {} });
        console.log(`  ${s.nama} PURCHASE ${pu.desc}: ${p.ok ? 'posted' : p.data?.message || p.status}`);
      } else console.log(`  ${s.nama} PURCHASE create gagal:`, inv.data?.message || inv.status);
    }
    // Faktur IC: utang anak ke induk (akun IC berdedikasi → tereliminasi).
    {
      const body = {
        cabangId: cabang, vendorId: vendByKode['IC-MP'], tanggal: '2026-06-16', termin: 'KREDIT',
        akunApId: byKode['2-108'], tarifPph23Persen: 0, potongPph23: false, idempotencyKey: key(),
        lines: [{ itemId: null, deskripsi: 'Jasa manajemen & lisensi dari induk (intercompany)', qty: '1', satuan: 'Job', hargaSatuan: String(s.icUtang), diskonPersen: '0', klasifikasiPpn: 'NON_BKP', isJasa: false, akunDebitId: byKode['5-201'] }],
      };
      const inv = await api('/purchase-invoices', { method: 'POST', token, tenant: s.tenant, body });
      if (inv.data?.id) {
        const p = await api(`/purchase-invoices/${inv.data.id}/post`, { method: 'POST', token, tenant: s.tenant, body: {} });
        console.log(`  ${s.nama} IC-PURCHASE ${s.icUtang}: ${p.ok ? 'posted' : p.data?.message || p.status}`);
      }
    }
  }

  // Induk: faktur penjualan IC ke tiap anak (akun IC berdedikasi).
  {
    const accts = (await api('/accounts?view=flat', { token, tenant: MP })).data;
    const byKode = Object.fromEntries(accts.map((a) => [a.kode, a.id]));
    const custs = (await api('/customers', { token, tenant: MP })).data;
    const custByKode = Object.fromEntries(custs.map((c) => [c.kode, c.id]));
    const cabang = (await api('/cabang', { token, tenant: MP })).data[0].id;
    for (const s of SUBS) {
      const body = {
        cabangId: cabang, customerId: custByKode[s.icCust], tanggal: '2026-06-15', termin: 'KREDIT',
        akunArId: byKode['1-108'], idempotencyKey: key(),
        lines: [{ itemId: null, deskripsi: `Jasa manajemen & lisensi ke ${s.nama} (intercompany)`, qty: '1', satuan: 'Job', hargaSatuan: String(s.icPiutang), diskonPersen: '0', klasifikasiPpn: 'NON_BKP', isJasa: false, akunPendapatanId: byKode['4-201'] }],
      };
      const inv = await api('/sales-invoices', { method: 'POST', token, tenant: MP, body });
      if (inv.data?.id) {
        const p = await api(`/sales-invoices/${inv.data.id}/post`, { method: 'POST', token, tenant: MP, body: {} });
        console.log(`  MP IC-SALE ke ${s.nama} ${s.icPiutang}: ${p.ok ? 'posted' : p.data?.message || p.status}`);
      } else console.log(`  MP IC-SALE create gagal:`, inv.data?.message || inv.status);
    }
  }
  console.log('SEED FAKTUR SELESAI');
}
main().catch((e) => { console.error(e); process.exit(1); });
