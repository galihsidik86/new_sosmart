/**
 * Seed data DEMO tambahan untuk MarkPlus — fitur baru:
 *   1. Approval berjenjang: user approver (manajer/direktur) + aturan.
 *   2. Konsolidasi grup: 2 anak (Institute 100%, OMG 80%) + intercompany + akuisisi.
 *   3. Rekonsiliasi bank: 1 worksheet contoh di akun bank MarkPlus.
 *
 * Idempotent secukupnya: upsert utk tenant/user/membership/account (kunci alami),
 * delete-then-create utk rule/group/invoice/rekon demo. Jalankan:
 *   pnpm --filter @lentera/db exec tsx prisma/seed-demo.ts
 */
import { PrismaClient, Role, AccountKind, NormalBalance, InvoiceStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const MP = '9e648607-436f-4aaf-aabd-f0abdd80100c';
const DEMO = 'd0aed161-16d7-4003-85ca-cc5e1a650281';
const INST = '11111111-1111-1111-1111-111111111111';
const OMG = '22222222-2222-2222-2222-222222222222';

async function acct(
  tenantId: string, kode: string, nama: string, kind: AccountKind, nb: NormalBalance,
  saldoAwal: string, opts: { intercompany?: boolean; klas?: string; kas?: boolean } = {},
) {
  return prisma.account.upsert({
    where: { tenantId_kode: { tenantId, kode } },
    update: {
      nama, saldoAwal, isIntercompany: !!opts.intercompany,
      klasifikasiNeraca: (opts.klas as never) ?? null, isKasSetara: !!opts.kas,
    },
    create: {
      tenantId, kode, nama, kind, normalBalance: nb, saldoAwal,
      isIntercompany: !!opts.intercompany,
      klasifikasiNeraca: (opts.klas as never) ?? null, isKasSetara: !!opts.kas,
    },
  });
}

async function seedSubsidiary(
  tenantId: string, nama: string,
  bs: { kas: number; piutang: number; utang: number; modal: number },
) {
  await prisma.tenant.upsert({ where: { id: tenantId }, update: { nama }, create: { id: tenantId, nama } });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: DEMO, tenantId } },
    update: { role: Role.OWNER }, create: { userId: DEMO, tenantId, role: Role.OWNER },
  });
  let fy = await prisma.fiscalYear.findFirst({ where: { tenantId } });
  if (!fy) {
    fy = await prisma.fiscalYear.create({
      data: { tenantId, kode: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
    });
  }
  let period = await prisma.fiscalPeriod.findFirst({ where: { tenantId, no: 6 } });
  if (!period) {
    period = await prisma.fiscalPeriod.create({
      data: { tenantId, fiscalYearId: fy.id, no: 6, label: 'Jun 2026', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30') },
    });
  }
  let cabang = await prisma.cabang.findFirst({ where: { tenantId } });
  if (!cabang) cabang = await prisma.cabang.create({ data: { tenantId, kode: 'PST', nama: 'Pusat' } });

  await acct(tenantId, '1-101', 'Kas & Bank', AccountKind.ASET, NormalBalance.DEBIT, String(bs.kas), { klas: 'ASET_LANCAR', kas: true });
  await acct(tenantId, '1-103', 'Piutang Usaha', AccountKind.ASET, NormalBalance.DEBIT, String(bs.piutang), { klas: 'ASET_LANCAR' });
  await acct(tenantId, '2-101', 'Utang Usaha', AccountKind.LIABILITAS, NormalBalance.KREDIT, String(bs.utang), { klas: 'LIABILITAS_PENDEK' });
  await acct(tenantId, '3-101', 'Modal Disetor', AccountKind.EKUITAS, NormalBalance.KREDIT, String(bs.modal), {});
  return { period, cabang };
}

async function main() {
  const pw = await argon2.hash('markplus123', { type: argon2.argon2id });

  // ---------- 1. APPROVAL: users + aturan ----------
  const manajer = await prisma.user.upsert({
    where: { email: 'manajer@markplusindonesia.co.id' }, update: {},
    create: { email: 'manajer@markplusindonesia.co.id', nama: 'Budi Manajer', passwordHash: pw },
  });
  const direktur = await prisma.user.upsert({
    where: { email: 'direktur@markplusindonesia.co.id' }, update: {},
    create: { email: 'direktur@markplusindonesia.co.id', nama: 'Sari Direktur', passwordHash: pw },
  });
  for (const [u, role] of [[manajer.id, Role.ADMIN], [direktur.id, Role.OWNER]] as const) {
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: u, tenantId: MP } }, update: { role }, create: { userId: u, tenantId: MP, role },
    });
  }
  await prisma.approvalRule.deleteMany({ where: { tenantId: MP } });
  const mkRule = async (docType: string, minAmount: string, steps: Array<{ role: string; userId?: string }>) => {
    const r = await prisma.approvalRule.create({ data: { tenantId: MP, docType: docType as never, minAmount, isActive: true } });
    await prisma.approvalRuleStep.createMany({
      data: steps.map((s, i) => ({ tenantId: MP, ruleId: r.id, urutan: i + 1, approverRole: s.role as never, approverUserId: s.userId ?? null })),
    });
  };
  await mkRule('PEMBELIAN', '50000000', [{ role: 'ADMIN' }]);
  await mkRule('PEMBELIAN', '250000000', [{ role: 'ADMIN' }, { role: 'OWNER', userId: direktur.id }]);
  await mkRule('KAS_BANK', '100000000', [{ role: 'OWNER', userId: direktur.id }]);
  console.log('✓ approval: 2 user approver + 3 aturan');

  // ---------- 2. KONSOLIDASI: anak + investasi induk + grup + IC ----------
  const inst = await seedSubsidiary(INST, 'PT MarkPlus Institute', { kas: 250e6, piutang: 200e6, utang: 50e6, modal: 400e6 });
  const omg = await seedSubsidiary(OMG, 'PT OMG Consulting', { kas: 200e6, piutang: 100e6, utang: 50e6, modal: 250e6 });

  // Investasi induk pada anak (intercompany, dieliminasi) + offset ekuitas.
  await acct(MP, '1-302', 'Investasi pada PT MarkPlus Institute', AccountKind.ASET, NormalBalance.DEBIT, '450000000', { intercompany: true, klas: 'ASET_TETAP' });
  await acct(MP, '1-303', 'Investasi pada PT OMG Consulting', AccountKind.ASET, NormalBalance.DEBIT, '300000000', { intercompany: true, klas: 'ASET_TETAP' });
  await acct(MP, '3-106', 'Tambahan Modal Disetor', AccountKind.EKUITAS, NormalBalance.KREDIT, '750000000', {});

  await prisma.group.deleteMany({ where: { tenantId: MP } });
  const g = await prisma.group.create({ data: { tenantId: MP, nama: 'MarkPlus Group' } });
  await prisma.groupMember.create({ data: { tenantId: MP, groupId: g.id, memberTenantId: INST, ownershipPct: '100', acquisitionCost: '450000000', acquisitionNetAssets: '400000000', acquisitionDate: new Date('2025-01-01') } });
  await prisma.groupMember.create({ data: { tenantId: MP, groupId: g.id, memberTenantId: OMG, ownershipPct: '80', acquisitionCost: '300000000', acquisitionNetAssets: '250000000', acquisitionDate: new Date('2025-06-01') } });

  // Referensi MP untuk faktur IC (pakai cabang + periode + piutang yang sudah ada).
  const mpCabang = await prisma.cabang.findFirst({ where: { tenantId: MP } });
  const mpPeriod = await prisma.fiscalPeriod.findFirst({ where: { tenantId: MP, startDate: { lte: new Date('2026-06-15') }, endDate: { gte: new Date('2026-06-15') } } })
    ?? await prisma.fiscalPeriod.findFirst({ where: { tenantId: MP }, orderBy: { startDate: 'desc' } });
  const mpAr = await prisma.account.findFirst({ where: { tenantId: MP, kode: '1-103' } });

  const seedIc = async (
    child: string, childNama: string, childRef: { period: { id: string }; cabang: { id: string } },
    piutang: number, utang: number, invNo: string, billNo: string,
  ) => {
    // MP: customer = anak, sales invoice (piutang IC).
    const cust = await prisma.customer.upsert({
      where: { tenantId_kode: { tenantId: MP, kode: `IC-${invNo}` } },
      update: { partnerTenantId: child, nama: childNama },
      create: { tenantId: MP, kode: `IC-${invNo}`, nama: childNama, partnerTenantId: child },
    });
    await prisma.salesInvoice.deleteMany({ where: { tenantId: MP, customerId: cust.id } });
    await prisma.salesInvoice.create({
      data: {
        tenantId: MP, cabangId: mpCabang!.id, fiscalPeriodId: mpPeriod!.id, customerId: cust.id,
        akunArId: mpAr!.id, nomor: invNo, tanggal: new Date('2026-06-10'), jatuhTempo: new Date('2026-07-10'),
        status: InvoiceStatus.POSTED, totalNetto: String(piutang), totalDibayar: '0',
      },
    });
    // Anak: vendor = induk, purchase invoice (utang IC).
    const childAp = await prisma.account.findFirst({ where: { tenantId: child, kode: '2-101' } });
    const vend = await prisma.vendor.upsert({
      where: { tenantId_kode: { tenantId: child, kode: 'IC-MP' } },
      update: { partnerTenantId: MP },
      create: { tenantId: child, kode: 'IC-MP', nama: 'PT MarkPlus Indonesia', partnerTenantId: MP },
    });
    await prisma.purchaseInvoice.deleteMany({ where: { tenantId: child, vendorId: vend.id } });
    await prisma.purchaseInvoice.create({
      data: {
        tenantId: child, cabangId: childRef.cabang.id, fiscalPeriodId: childRef.period.id, vendorId: vend.id,
        akunApId: childAp!.id, nomor: billNo, tanggal: new Date('2026-06-12'), jatuhTempo: new Date('2026-07-12'),
        status: InvoiceStatus.POSTED, totalNetto: String(utang), totalDibayar: '0',
      },
    });
  };
  await seedIc(INST, 'PT MarkPlus Institute', inst, 60e6, 60e6, 'INV-MP-2026-06-0101', 'BILL-INST-2026-06-0044'); // cocok
  await seedIc(OMG, 'PT OMG Consulting', omg, 40e6, 35e6, 'INV-MP-2026-06-0102', 'BILL-OMG-2026-06-0021');   // selisih 5jt
  console.log('✓ konsolidasi: 2 anak + investasi + grup + transaksi IC');

  // ---------- 3. REKONSILIASI BANK di MarkPlus ----------
  await prisma.bankReconciliation.deleteMany({ where: { tenantId: MP } });
  const bank = await prisma.account.findFirst({ where: { tenantId: MP, isKasSetara: true, isPostable: true, kode: { startsWith: '1-102' } } })
    ?? await prisma.account.findFirst({ where: { tenantId: MP, isKasSetara: true, isPostable: true } });
  if (bank) {
    const cutoff = new Date('2026-06-30');
    const lines = await prisma.journalLine.findMany({
      where: { accountId: bank.id, journal: { status: 'POSTED', tanggal: { lte: cutoff } } },
      select: { id: true, debit: true, kredit: true, journal: { select: { tanggal: true } } },
      orderBy: { journal: { tanggal: 'asc' } },
    });
    // Clear semua baris sebelum Juni; sisakan baris Juni sebagai item beredar.
    const clearBefore = new Date('2026-06-01');
    let clearedNet = 0;
    const clearedIds: string[] = [];
    for (const l of lines) {
      if (l.journal.tanggal < clearBefore) {
        clearedIds.push(l.id);
        clearedNet += Number(l.debit) - Number(l.kredit);
      }
    }
    const saldoRekeningKoran = Number(bank.saldoAwal) + clearedNet; // → selisih 0 (siap finalize)
    const recon = await prisma.bankReconciliation.create({
      data: { tenantId: MP, akunId: bank.id, tanggal: cutoff, saldoRekeningKoran: String(saldoRekeningKoran), status: 'DRAFT' },
    });
    if (clearedIds.length) {
      await prisma.bankReconciliationLine.createMany({
        data: clearedIds.map((jl) => ({ tenantId: MP, reconciliationId: recon.id, journalLineId: jl })),
      });
    }
    console.log(`✓ rekonsiliasi bank: ${bank.kode} ${bank.nama}, ${clearedIds.length} baris cleared`);
  } else {
    console.log('… lewati rekonsiliasi bank (tidak ada akun bank)');
  }

  console.log('SEED DEMO SELESAI');
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
