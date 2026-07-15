/**
 * Seed data DEMO tambahan untuk MarkPlus — fitur baru + anak perusahaan "riil":
 *   1. Approval berjenjang: user approver (manajer/direktur) + aturan.
 *   2. Konsolidasi grup: 2 anak (Marketeers 100%, MarkPlus Inspirasi 80%) dengan
 *      COA LENGKAP + saldo awal + transaksi (jurnal) → Neraca & Laba Rugi riil,
 *      + intercompany + data akuisisi (goodwill/NCI).
 *   3. Rekonsiliasi bank: 1 worksheet contoh di akun bank MarkPlus.
 *
 * Idempotent secukupnya. Jalankan:
 *   pnpm --filter @lentera/db exec tsx prisma/seed-demo.ts
 */
import { PrismaClient, Role, AccountKind, NormalBalance, InvoiceStatus, PeriodStatus, FiscalYearStatus, JournalSource, JournalStatus } from '@prisma/client';
import { deriveKlasifikasiNeraca, deriveIsKasSetara } from '@lentera/shared/enums';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const MP = '9e648607-436f-4aaf-aabd-f0abdd80100c';
const DEMO = 'd0aed161-16d7-4003-85ca-cc5e1a650281';
const INST = '11111111-1111-1111-1111-111111111111';
const OMG = '22222222-2222-2222-2222-222222222222';

// ---------- COA standar (mirror seed.ts) ----------
type CoaNode = { kode: string; nama: string; kind: AccountKind; normal: NormalBalance; postable?: boolean; children?: CoaNode[] };
const A = AccountKind, D = NormalBalance.DEBIT, K = NormalBalance.KREDIT;
const COA: CoaNode[] = [
  { kode: '1', nama: 'ASET', kind: A.ASET, normal: D, postable: false, children: [
    { kode: '1-10', nama: 'Aset Lancar', kind: A.ASET, normal: D, postable: false, children: [
      { kode: '1-101', nama: 'Kas', kind: A.ASET, normal: D },
      { kode: '1-102', nama: 'Bank', kind: A.ASET, normal: D, postable: false, children: [
        { kode: '1-1021', nama: 'Bank BCA', kind: A.ASET, normal: D },
        { kode: '1-1022', nama: 'Bank Mandiri', kind: A.ASET, normal: D },
      ] },
      { kode: '1-103', nama: 'Piutang Usaha', kind: A.ASET, normal: D },
      { kode: '1-104', nama: 'Persediaan', kind: A.ASET, normal: D },
      { kode: '1-105', nama: 'PPN Masukan', kind: A.ASET, normal: D },
      { kode: '1-106', nama: 'Beban Dibayar Dimuka', kind: A.ASET, normal: D },
    ] },
    { kode: '1-20', nama: 'Aset Tetap', kind: A.ASET, normal: D, postable: false, children: [
      { kode: '1-202', nama: 'Bangunan', kind: A.ASET, normal: D },
      { kode: '1-203', nama: 'Akumulasi Penyusutan Bangunan', kind: A.ASET, normal: K },
      { kode: '1-206', nama: 'Peralatan & Mesin', kind: A.ASET, normal: D },
      { kode: '1-207', nama: 'Akumulasi Penyusutan Peralatan', kind: A.ASET, normal: K },
    ] },
  ] },
  { kode: '2', nama: 'LIABILITAS', kind: A.LIABILITAS, normal: K, postable: false, children: [
    { kode: '2-10', nama: 'Liabilitas Jangka Pendek', kind: A.LIABILITAS, normal: K, postable: false, children: [
      { kode: '2-101', nama: 'Utang Usaha', kind: A.LIABILITAS, normal: K },
      { kode: '2-1021', nama: 'Utang PPN Keluaran', kind: A.LIABILITAS, normal: K },
      { kode: '2-1022', nama: 'Utang PPh 21', kind: A.LIABILITAS, normal: K },
      { kode: '2-110', nama: 'Beban Masih Harus Dibayar', kind: A.LIABILITAS, normal: K },
    ] },
    { kode: '2-20', nama: 'Liabilitas Jangka Panjang', kind: A.LIABILITAS, normal: K, postable: false, children: [
      { kode: '2-201', nama: 'Utang Bank', kind: A.LIABILITAS, normal: K },
    ] },
  ] },
  { kode: '3', nama: 'EKUITAS', kind: A.EKUITAS, normal: K, postable: false, children: [
    { kode: '3-101', nama: 'Modal Disetor', kind: A.EKUITAS, normal: K },
    { kode: '3-102', nama: 'Saldo Laba (Ditahan)', kind: A.EKUITAS, normal: K },
    { kode: '3-104', nama: 'Dividen', kind: A.EKUITAS, normal: D },
  ] },
  { kode: '4', nama: 'PENDAPATAN', kind: A.PENDAPATAN, normal: K, postable: false, children: [
    { kode: '4-101', nama: 'Pendapatan Jasa', kind: A.PENDAPATAN, normal: K },
    { kode: '4-102', nama: 'Pendapatan Iklan & Media', kind: A.PENDAPATAN, normal: K },
  ] },
  { kode: '5', nama: 'BEBAN POKOK', kind: A.BEBAN_POKOK, normal: D, postable: false, children: [
    { kode: '5-101', nama: 'Beban Pokok Jasa', kind: A.BEBAN_POKOK, normal: D },
  ] },
  { kode: '6', nama: 'BEBAN OPERASIONAL', kind: A.BEBAN, normal: D, postable: false, children: [
    { kode: '6-101', nama: 'Beban Gaji & Tunjangan', kind: A.BEBAN, normal: D },
    { kode: '6-102', nama: 'Beban Sewa', kind: A.BEBAN, normal: D },
    { kode: '6-103', nama: 'Beban Penyusutan', kind: A.BEBAN, normal: D },
    { kode: '6-104', nama: 'Beban Pemasaran', kind: A.BEBAN, normal: D },
    { kode: '6-105', nama: 'Beban Listrik & Utilitas', kind: A.BEBAN, normal: D },
    { kode: '6-106', nama: 'Beban Administrasi & Umum', kind: A.BEBAN, normal: D },
  ] },
  { kode: '8', nama: 'BEBAN LAIN-LAIN', kind: A.BEBAN_LAIN, normal: D, postable: false, children: [
    { kode: '8-101', nama: 'Beban Bunga Bank', kind: A.BEBAN_LAIN, normal: D },
  ] },
];

async function seedFullCoa(tenantId: string) {
  const insert = async (node: CoaNode, parentKode?: string): Promise<void> => {
    const postable = node.postable ?? !node.children;
    const parent = parentKode ? await prisma.account.findUnique({ where: { tenantId_kode: { tenantId, kode: parentKode } }, select: { id: true } }) : null;
    await prisma.account.upsert({
      where: { tenantId_kode: { tenantId, kode: node.kode } },
      update: { nama: node.nama, isPostable: postable, parentId: parent?.id ?? null },
      create: {
        tenantId, kode: node.kode, nama: node.nama, kind: node.kind, normalBalance: node.normal,
        isPostable: postable, parentId: parent?.id ?? null, saldoAwal: '0',
        klasifikasiNeraca: deriveKlasifikasiNeraca(node.kind, node.kode) as never,
        isKasSetara: deriveIsKasSetara(node.kode),
      },
    });
    for (const c of node.children ?? []) await insert(c, node.kode);
  };
  for (const root of COA) await insert(root);
}

async function openBal(tenantId: string, kode: string, amount: number) {
  await prisma.account.update({ where: { tenantId_kode: { tenantId, kode } }, data: { saldoAwal: String(amount) } });
}

async function seedFY(tenantId: string) {
  const fy = await prisma.fiscalYear.upsert({
    where: { tenantId_kode: { tenantId, kode: '2026' } },
    update: {},
    create: { tenantId, kode: '2026', startDate: new Date(Date.UTC(2026, 0, 1)), endDate: new Date(Date.UTC(2026, 11, 31)), status: FiscalYearStatus.OPEN },
  });
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  for (let m = 1; m <= 12; m++) {
    await prisma.fiscalPeriod.upsert({
      where: { tenantId_fiscalYearId_no: { tenantId, fiscalYearId: fy.id, no: m } },
      update: {},
      create: {
        tenantId, fiscalYearId: fy.id, no: m, label: `${bulan[m - 1]} 2026`,
        startDate: new Date(Date.UTC(2026, m - 1, 1)), endDate: new Date(Date.UTC(2026, m, 0)),
        status: m <= 4 ? PeriodStatus.CLOSED : PeriodStatus.OPEN,
      },
    });
  }
  return fy;
}

async function postJournal(
  tenantId: string, cabangId: string, periodId: string, tanggal: Date, nomor: string, deskripsi: string,
  lines: Array<{ kode: string; debit?: number; kredit?: number }>,
) {
  const accts = await prisma.account.findMany({ where: { tenantId, kode: { in: lines.map((l) => l.kode) } }, select: { id: true, kode: true } });
  const idByKode = new Map(accts.map((a) => [a.kode, a.id]));
  let td = 0, tk = 0;
  const lineData = lines.map((l, i) => {
    const debit = l.debit ?? 0, kredit = l.kredit ?? 0;
    td += debit; tk += kredit;
    return { tenantId, accountId: idByKode.get(l.kode)!, no: i + 1, debit: String(debit), kredit: String(kredit) };
  });
  await prisma.journal.create({
    data: {
      tenantId, cabangId, fiscalPeriodId: periodId, nomor, tanggal, deskripsi,
      sumber: JournalSource.MANUAL, status: JournalStatus.POSTED, postedAt: tanggal, postedById: DEMO,
      totalDebit: String(td), totalKredit: String(tk), lines: { create: lineData },
    },
  });
}

async function seedSubsidiary(
  tenantId: string, nama: string,
  bal: Record<string, number>,
  jurnal: Array<{ no: string; bulan: number; tgl: string; desc: string; lines: Array<{ kode: string; debit?: number; kredit?: number }> }>,
) {
  await prisma.tenant.upsert({ where: { id: tenantId }, update: { nama }, create: { id: tenantId, nama } });
  await prisma.membership.upsert({ where: { userId_tenantId: { userId: DEMO, tenantId } }, update: { role: Role.OWNER }, create: { userId: DEMO, tenantId, role: Role.OWNER } });
  await seedFullCoa(tenantId);
  const fy = await seedFY(tenantId);
  let cabang = await prisma.cabang.findFirst({ where: { tenantId } });
  if (!cabang) cabang = await prisma.cabang.create({ data: { tenantId, kode: 'PST', nama: 'Kantor Pusat' } });
  for (const [kode, amt] of Object.entries(bal)) await openBal(tenantId, kode, amt);
  // Hapus jurnal manual lama (idempotent) lalu post ulang.
  await prisma.journal.deleteMany({ where: { tenantId, sumber: JournalSource.MANUAL } });
  const periods = await prisma.fiscalPeriod.findMany({ where: { tenantId }, select: { id: true, no: true } });
  const pById = new Map(periods.map((p) => [p.no, p.id]));
  for (const j of jurnal) {
    await postJournal(tenantId, cabang.id, pById.get(j.bulan)!, new Date(j.tgl + 'T00:00:00Z'), j.no, j.desc, j.lines);
  }
  const jun = periods.find((p) => p.no === 6)!;
  return { period: { id: jun.id }, cabang };
}

async function main() {
  const pw = await argon2.hash('markplus123', { type: argon2.argon2id });

  // ---------- 1. APPROVAL ----------
  const manajer = await prisma.user.upsert({ where: { email: 'manajer@markplusindonesia.co.id' }, update: {}, create: { email: 'manajer@markplusindonesia.co.id', nama: 'Budi Manajer', passwordHash: pw } });
  const direktur = await prisma.user.upsert({ where: { email: 'direktur@markplusindonesia.co.id' }, update: {}, create: { email: 'direktur@markplusindonesia.co.id', nama: 'Sari Direktur', passwordHash: pw } });
  for (const [u, role] of [[manajer.id, Role.ADMIN], [direktur.id, Role.OWNER]] as const) {
    await prisma.membership.upsert({ where: { userId_tenantId: { userId: u, tenantId: MP } }, update: { role }, create: { userId: u, tenantId: MP, role } });
  }
  await prisma.approvalRule.deleteMany({ where: { tenantId: MP } });
  const mkRule = async (docType: string, minAmount: string, steps: Array<{ role: string; userId?: string }>) => {
    const r = await prisma.approvalRule.create({ data: { tenantId: MP, docType: docType as never, minAmount, isActive: true } });
    await prisma.approvalRuleStep.createMany({ data: steps.map((s, i) => ({ tenantId: MP, ruleId: r.id, urutan: i + 1, approverRole: s.role as never, approverUserId: s.userId ?? null })) });
  };
  await mkRule('PEMBELIAN', '50000000', [{ role: 'ADMIN' }]);
  await mkRule('PEMBELIAN', '250000000', [{ role: 'ADMIN' }, { role: 'OWNER', userId: direktur.id }]);
  await mkRule('KAS_BANK', '100000000', [{ role: 'OWNER', userId: direktur.id }]);
  console.log('✓ approval: 2 user approver + 3 aturan');

  // ---------- 2. KONSOLIDASI: anak dengan COA lengkap + transaksi ----------
  const marketeers = await seedSubsidiary(INST, 'Marketeers',
    { '1-101': 120e6, '1-1021': 350e6, '1-103': 200e6, '1-104': 150e6, '1-202': 300e6, '1-203': 60e6, '1-206': 200e6, '1-207': 50e6, '2-101': 120e6, '2-201': 200e6, '3-101': 700e6, '3-102': 190e6 },
    [
      { no: 'JU-2026-05-0001', bulan: 5, tgl: '2026-05-20', desc: 'Pendapatan iklan Mei (kredit)', lines: [{ kode: '1-103', debit: 120e6 }, { kode: '4-102', kredit: 120e6 }] },
      { no: 'JU-2026-06-0001', bulan: 6, tgl: '2026-06-05', desc: 'Pendapatan iklan & media Juni', lines: [{ kode: '1-1021', debit: 210e6 }, { kode: '4-102', kredit: 210e6 }] },
      { no: 'JU-2026-06-0002', bulan: 6, tgl: '2026-06-25', desc: 'Beban gaji redaksi Juni', lines: [{ kode: '6-101', debit: 95e6 }, { kode: '1-1021', kredit: 95e6 }] },
      { no: 'JU-2026-06-0003', bulan: 6, tgl: '2026-06-28', desc: 'Beban sewa kantor Juni', lines: [{ kode: '6-102', debit: 28e6 }, { kode: '1-1021', kredit: 28e6 }] },
      { no: 'JU-2026-06-0004', bulan: 6, tgl: '2026-06-29', desc: 'Beban pemasaran Juni', lines: [{ kode: '6-104', debit: 22e6 }, { kode: '1-101', kredit: 22e6 }] },
    ]);
  const inspirasi = await seedSubsidiary(OMG, 'MarkPlus Inspirasi Indonesia',
    { '1-101': 80e6, '1-1021': 220e6, '1-103': 130e6, '1-104': 60e6, '1-206': 150e6, '1-207': 30e6, '2-101': 90e6, '2-201': 120e6, '3-101': 300e6, '3-102': 100e6 },
    [
      { no: 'JU-2026-05-0001', bulan: 5, tgl: '2026-05-18', desc: 'Pendapatan pelatihan Mei (kredit)', lines: [{ kode: '1-103', debit: 75e6 }, { kode: '4-101', kredit: 75e6 }] },
      { no: 'JU-2026-06-0001', bulan: 6, tgl: '2026-06-08', desc: 'Pendapatan jasa pelatihan Juni', lines: [{ kode: '1-1021', debit: 130e6 }, { kode: '4-101', kredit: 130e6 }] },
      { no: 'JU-2026-06-0002', bulan: 6, tgl: '2026-06-26', desc: 'Beban gaji trainer Juni', lines: [{ kode: '6-101', debit: 62e6 }, { kode: '1-1021', kredit: 62e6 }] },
      { no: 'JU-2026-06-0003', bulan: 6, tgl: '2026-06-27', desc: 'Beban sewa venue Juni', lines: [{ kode: '6-102', debit: 20e6 }, { kode: '1-101', kredit: 20e6 }] },
      { no: 'JU-2026-06-0004', bulan: 6, tgl: '2026-06-30', desc: 'Beban administrasi Juni', lines: [{ kode: '6-106', debit: 14e6 }, { kode: '1-101', kredit: 14e6 }] },
    ]);

  // Investasi induk (intercompany, dieliminasi) + offset ekuitas.
  const mpAcct = async (kode: string, nama: string, kind: AccountKind, nb: NormalBalance, saldo: string, ic: boolean, klas: string | null) => {
    await prisma.account.upsert({
      where: { tenantId_kode: { tenantId: MP, kode } },
      update: { nama, saldoAwal: saldo, isIntercompany: ic, klasifikasiNeraca: (klas as never) ?? null },
      create: { tenantId: MP, kode, nama, kind, normalBalance: nb, saldoAwal: saldo, isIntercompany: ic, klasifikasiNeraca: (klas as never) ?? null },
    });
  };
  await mpAcct('1-302', 'Investasi pada Marketeers', A.ASET, D, '450000000', true, 'ASET_TETAP');
  await mpAcct('1-303', 'Investasi pada MarkPlus Inspirasi Indonesia', A.ASET, D, '300000000', true, 'ASET_TETAP');
  await mpAcct('3-106', 'Tambahan Modal Disetor', A.EKUITAS, K, '750000000', false, null);

  await prisma.group.deleteMany({ where: { tenantId: MP } });
  const g = await prisma.group.create({ data: { tenantId: MP, nama: 'MarkPlus Group' } });
  await prisma.groupMember.create({ data: { tenantId: MP, groupId: g.id, memberTenantId: INST, ownershipPct: '100', acquisitionCost: '450000000', acquisitionNetAssets: '400000000', acquisitionDate: new Date('2025-01-01') } });
  await prisma.groupMember.create({ data: { tenantId: MP, groupId: g.id, memberTenantId: OMG, ownershipPct: '80', acquisitionCost: '300000000', acquisitionNetAssets: '250000000', acquisitionDate: new Date('2025-06-01') } });

  // Transaksi intercompany (faktur) — MP jual jasa ke anak.
  const mpCabang = await prisma.cabang.findFirst({ where: { tenantId: MP } });
  const mpPeriod = await prisma.fiscalPeriod.findFirst({ where: { tenantId: MP, startDate: { lte: new Date('2026-06-15') }, endDate: { gte: new Date('2026-06-15') } } })
    ?? await prisma.fiscalPeriod.findFirst({ where: { tenantId: MP }, orderBy: { startDate: 'desc' } });
  const mpAr = await prisma.account.findFirst({ where: { tenantId: MP, kode: '1-103' } });
  const seedIc = async (child: string, childNama: string, ref: { period: { id: string }; cabang: { id: string } }, piutang: number, utang: number, invNo: string, billNo: string) => {
    const cust = await prisma.customer.upsert({ where: { tenantId_kode: { tenantId: MP, kode: `IC-${invNo}` } }, update: { partnerTenantId: child, nama: childNama }, create: { tenantId: MP, kode: `IC-${invNo}`, nama: childNama, partnerTenantId: child } });
    await prisma.salesInvoice.deleteMany({ where: { tenantId: MP, customerId: cust.id } });
    await prisma.salesInvoice.create({ data: { tenantId: MP, cabangId: mpCabang!.id, fiscalPeriodId: mpPeriod!.id, customerId: cust.id, akunArId: mpAr!.id, nomor: invNo, tanggal: new Date('2026-06-10'), jatuhTempo: new Date('2026-07-10'), status: InvoiceStatus.POSTED, totalNetto: String(piutang), totalDibayar: '0' } });
    const childAp = await prisma.account.findFirst({ where: { tenantId: child, kode: '2-101' } });
    const vend = await prisma.vendor.upsert({ where: { tenantId_kode: { tenantId: child, kode: 'IC-MP' } }, update: { partnerTenantId: MP, akunUtangId: childAp!.id }, create: { tenantId: child, kode: 'IC-MP', nama: 'PT MarkPlus Indonesia', partnerTenantId: MP, akunUtangId: childAp!.id } });
    await prisma.purchaseInvoice.deleteMany({ where: { tenantId: child, vendorId: vend.id } });
    await prisma.purchaseInvoice.create({ data: { tenantId: child, cabangId: ref.cabang.id, fiscalPeriodId: ref.period.id, vendorId: vend.id, akunApId: childAp!.id, nomor: billNo, tanggal: new Date('2026-06-12'), jatuhTempo: new Date('2026-07-12'), status: InvoiceStatus.POSTED, totalNetto: String(utang), totalDibayar: '0' } });
  };
  await seedIc(INST, 'Marketeers', marketeers, 60e6, 60e6, 'INV-MP-2026-06-0101', 'BILL-MKT-2026-06-0044');
  await seedIc(OMG, 'MarkPlus Inspirasi Indonesia', inspirasi, 40e6, 35e6, 'INV-MP-2026-06-0102', 'BILL-INSP-2026-06-0021');
  console.log('✓ konsolidasi: 2 anak (COA lengkap + saldo awal + jurnal) + investasi + grup + IC');

  // ---------- 3. REKONSILIASI BANK ----------
  await prisma.bankReconciliation.deleteMany({ where: { tenantId: MP } });
  const bank = await prisma.account.findFirst({ where: { tenantId: MP, isKasSetara: true, isPostable: true, kode: { startsWith: '1-102' } } })
    ?? await prisma.account.findFirst({ where: { tenantId: MP, isKasSetara: true, isPostable: true } });
  if (bank) {
    const cutoff = new Date('2026-06-30');
    const lines = await prisma.journalLine.findMany({ where: { accountId: bank.id, journal: { status: JournalStatus.POSTED, tanggal: { lte: cutoff } } }, select: { id: true, debit: true, kredit: true, journal: { select: { tanggal: true } } }, orderBy: { journal: { tanggal: 'asc' } } });
    const clearBefore = new Date('2026-06-01');
    let clearedNet = 0; const clearedIds: string[] = [];
    for (const l of lines) if (l.journal.tanggal < clearBefore) { clearedIds.push(l.id); clearedNet += Number(l.debit) - Number(l.kredit); }
    const recon = await prisma.bankReconciliation.create({ data: { tenantId: MP, akunId: bank.id, tanggal: cutoff, saldoRekeningKoran: String(Number(bank.saldoAwal) + clearedNet), status: 'DRAFT' } });
    if (clearedIds.length) await prisma.bankReconciliationLine.createMany({ data: clearedIds.map((jl) => ({ tenantId: MP, reconciliationId: recon.id, journalLineId: jl })) });
    console.log(`✓ rekonsiliasi bank: ${bank.kode} ${bank.nama}, ${clearedIds.length} baris cleared`);
  }

  console.log('SEED DEMO SELESAI');
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
