/**
 * Set linkBukti (URL bukti transaksi) untuk tenant MarkPlus ke dokumen contoh
 * yang BENAR-BENAR bisa dibuka — di-host oleh app Lentera sendiri
 * (apps/web/public/bukti/*.pdf → https://lentera.sosmartpro.com/bukti/...).
 *
 * Dipetakan per jenis transaksi supaya bukti yang terbuka cocok konteksnya:
 *   penjualan  → faktur-penjualan.pdf
 *   pembelian  → tagihan-pembelian.pdf
 *   kas/bank   → kwitansi-kas-bank.pdf
 *   pajak      → faktur-pajak.pdf
 * Jurnal ikut jenis sumbernya; jurnal penyusutan/manual (tanpa bukti eksternal)
 * di-set null supaya tak ada tautan mati.
 *
 * Jalankan: pnpm --filter @lentera/db exec tsx prisma/backfill-bukti.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'https://lentera.sosmartpro.com/bukti';
const URL = {
  sales: `${BASE}/faktur-penjualan.pdf`,
  purchase: `${BASE}/tagihan-pembelian.pdf`,
  cash: `${BASE}/kwitansi-kas-bank.pdf`,
  pajak: `${BASE}/faktur-pajak.pdf`,
};

async function main() {
  const t = await prisma.tenant.findFirst({ where: { nama: 'PT MarkPlus Indonesia' } });
  if (!t) throw new Error('Tenant PT MarkPlus Indonesia tidak ditemukan');
  const tenantId = t.id;

  const s = await prisma.salesInvoice.updateMany({ where: { tenantId }, data: { linkBukti: URL.sales } });
  const p = await prisma.purchaseInvoice.updateMany({ where: { tenantId }, data: { linkBukti: URL.purchase } });
  const c = await prisma.cashBankEntry.updateMany({ where: { tenantId }, data: { linkBukti: URL.cash } });

  const jSales = await prisma.journal.updateMany({ where: { tenantId, sumber: { in: ['PENJUALAN', 'RETUR_JUAL'] as never } }, data: { linkBukti: URL.sales } });
  const jPurch = await prisma.journal.updateMany({ where: { tenantId, sumber: { in: ['PEMBELIAN', 'RETUR_BELI'] as never } }, data: { linkBukti: URL.purchase } });
  const jCash = await prisma.journal.updateMany({ where: { tenantId, sumber: 'KAS_BANK' as never }, data: { linkBukti: URL.cash } });
  const jPajak = await prisma.journal.updateMany({ where: { tenantId, sumber: 'PAJAK' as never }, data: { linkBukti: URL.pajak } });
  // Sisanya (penyusutan/manual): tak ada bukti eksternal → bersihkan tautan mati.
  const jNull = await prisma.journal.updateMany({
    where: { tenantId, sumber: { notIn: ['PENJUALAN', 'RETUR_JUAL', 'PEMBELIAN', 'RETUR_BELI', 'KAS_BANK', 'PAJAK'] as never } },
    data: { linkBukti: null },
  });

  console.log('✅ Backfill bukti (URL host sendiri):');
  console.log(`   sales_invoices     : ${s.count}`);
  console.log(`   purchase_invoices  : ${p.count}`);
  console.log(`   cash_bank_entries  : ${c.count}`);
  console.log(`   journals penjualan : ${jSales.count}`);
  console.log(`   journals pembelian : ${jPurch.count}`);
  console.log(`   journals kas/bank  : ${jCash.count}`);
  console.log(`   journals pajak     : ${jPajak.count}`);
  console.log(`   journals di-null   : ${jNull.count} (penyusutan/manual)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
