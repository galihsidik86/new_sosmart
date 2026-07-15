/**
 * Seed MarkPlus — data demo untuk PT MarkPlus Indonesia
 * (riset pasar & konsultan marketing — profil MarkPlus, Inc.)
 *
 * Bagian MASTER + SALDO AWAL saja (deklaratif, aman). Transaksi finansial
 * (faktur, kas/bank, payroll, penyusutan) di-generate lewat API oleh
 * drive-markplus.mjs supaya semua jurnal dibangun & divalidasi engine app.
 *
 * Menulis manifest ID ke MANIFEST_PATH (default ./markplus-manifest.json)
 * untuk dipakai driver API.
 *
 * Jalankan: RESET=1 tsx prisma/seed-markplus.ts   (RESET → hapus tenant lama dulu)
 */

import {
  PrismaClient,
  AccountKind,
  NormalBalance,
  PpnSkema,
  Role,
  KlasifikasiPpn,
  PeriodStatus,
  FiscalYearStatus,
  KelompokAsetTetap,
  MetodePenyusutan,
  AsetStatus,
  PtkpStatus,
  JenisKaryawan,
  ProjectStatus,
  ProjectMemberRole,
} from '@prisma/client';
import argon2 from 'argon2';
import { writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const YEAR = 2026;
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? './markplus-manifest.json';
const TENANT_NAMA = 'PT MarkPlus Indonesia';

// ===============================================================
// COA — perusahaan JASA (riset pasar & konsultan marketing).
// Kode standar dipertahankan supaya GlConfig default + laporan
// (Arus Kas hardcoded codes) tetap resolve. Bagian pendapatan &
// beban pokok diadaptasi untuk perusahaan jasa.
// ===============================================================

type CoaNode = {
  kode: string;
  nama: string;
  kind: AccountKind;
  normal: NormalBalance;
  postable?: boolean;
  saldoAwal?: string; // magnitude, tanda ikut normalBalance
  children?: CoaNode[];
};

const D = NormalBalance.DEBIT;
const K = NormalBalance.KREDIT;

const COA: CoaNode[] = [
  {
    kode: '1', nama: 'ASET', kind: AccountKind.ASET, normal: D, postable: false,
    children: [
      {
        kode: '1-10', nama: 'Aset Lancar', kind: AccountKind.ASET, normal: D, postable: false,
        children: [
          { kode: '1-101', nama: 'Kas', kind: AccountKind.ASET, normal: D, saldoAwal: '150000000' },
          {
            kode: '1-102', nama: 'Bank', kind: AccountKind.ASET, normal: D, postable: false,
            children: [
              { kode: '1-1021', nama: 'Bank BCA', kind: AccountKind.ASET, normal: D, saldoAwal: '2800000000' },
              { kode: '1-1022', nama: 'Bank Mandiri', kind: AccountKind.ASET, normal: D, saldoAwal: '1500000000' },
              { kode: '1-1023', nama: 'Bank BNI', kind: AccountKind.ASET, normal: D, saldoAwal: '700000000' },
            ],
          },
          { kode: '1-103', nama: 'Piutang Usaha', kind: AccountKind.ASET, normal: D, saldoAwal: '0' },
          { kode: '1-104', nama: 'Persediaan (Merchandise & Buku)', kind: AccountKind.ASET, normal: D, saldoAwal: '0' },
          { kode: '1-105', nama: 'PPN Masukan', kind: AccountKind.ASET, normal: D, saldoAwal: '0' },
          { kode: '1-106', nama: 'Beban Dibayar Dimuka', kind: AccountKind.ASET, normal: D, saldoAwal: '240000000' },
          { kode: '1-107', nama: 'PPh 23/25 Dibayar Dimuka (Kredit Pajak)', kind: AccountKind.ASET, normal: D, saldoAwal: '60000000' },
        ],
      },
      {
        kode: '1-20', nama: 'Aset Tetap', kind: AccountKind.ASET, normal: D, postable: false,
        children: [
          { kode: '1-201', nama: 'Tanah', kind: AccountKind.ASET, normal: D, saldoAwal: '0' },
          { kode: '1-202', nama: 'Renovasi & Interior Kantor', kind: AccountKind.ASET, normal: D, saldoAwal: '1200000000' },
          { kode: '1-203', nama: 'Akumulasi Penyusutan Renovasi & Interior', kind: AccountKind.ASET, normal: K, saldoAwal: '360000000' },
          { kode: '1-204', nama: 'Kendaraan', kind: AccountKind.ASET, normal: D, saldoAwal: '900000000' },
          { kode: '1-205', nama: 'Akumulasi Penyusutan Kendaraan', kind: AccountKind.ASET, normal: K, saldoAwal: '400000000' },
          { kode: '1-206', nama: 'Peralatan & Perangkat Kantor', kind: AccountKind.ASET, normal: D, saldoAwal: '1600000000' },
          { kode: '1-207', nama: 'Akumulasi Penyusutan Peralatan & Perangkat', kind: AccountKind.ASET, normal: K, saldoAwal: '700000000' },
        ],
      },
    ],
  },
  {
    kode: '2', nama: 'LIABILITAS', kind: AccountKind.LIABILITAS, normal: K, postable: false,
    children: [
      {
        kode: '2-10', nama: 'Liabilitas Jangka Pendek', kind: AccountKind.LIABILITAS, normal: K, postable: false,
        children: [
          { kode: '2-101', nama: 'Utang Usaha', kind: AccountKind.LIABILITAS, normal: K, saldoAwal: '0' },
          {
            kode: '2-102', nama: 'Utang Pajak', kind: AccountKind.LIABILITAS, normal: K, postable: false,
            children: [
              { kode: '2-1021', nama: 'Utang PPN Keluaran', kind: AccountKind.LIABILITAS, normal: K },
              { kode: '2-1022', nama: 'Utang PPh 21', kind: AccountKind.LIABILITAS, normal: K },
              { kode: '2-1023', nama: 'Utang PPh 23', kind: AccountKind.LIABILITAS, normal: K },
              { kode: '2-1024', nama: 'Utang PPh 25/29', kind: AccountKind.LIABILITAS, normal: K },
              { kode: '2-1025', nama: 'Utang PPh 4(2) Final', kind: AccountKind.LIABILITAS, normal: K },
            ],
          },
          { kode: '2-106', nama: 'Utang BPJS Karyawan', kind: AccountKind.LIABILITAS, normal: K },
          { kode: '2-107', nama: 'Utang BPJS Pemberi Kerja', kind: AccountKind.LIABILITAS, normal: K },
          { kode: '2-110', nama: 'Beban Yang Masih Harus Dibayar', kind: AccountKind.LIABILITAS, normal: K },
        ],
      },
      {
        kode: '2-20', nama: 'Liabilitas Jangka Panjang', kind: AccountKind.LIABILITAS, normal: K, postable: false,
        children: [
          { kode: '2-201', nama: 'Utang Bank', kind: AccountKind.LIABILITAS, normal: K, saldoAwal: '800000000' },
        ],
      },
    ],
  },
  {
    kode: '3', nama: 'EKUITAS', kind: AccountKind.EKUITAS, normal: K, postable: false,
    children: [
      { kode: '3-101', nama: 'Modal Disetor', kind: AccountKind.EKUITAS, normal: K, saldoAwal: '5000000000' },
      { kode: '3-102', nama: 'Saldo Laba (Ditahan)', kind: AccountKind.EKUITAS, normal: K, saldoAwal: '1890000000' },
      { kode: '3-103', nama: 'Ikhtisar Laba Rugi', kind: AccountKind.EKUITAS, normal: K },
      { kode: '3-104', nama: 'Dividen', kind: AccountKind.EKUITAS, normal: D },
    ],
  },
  {
    kode: '4', nama: 'PENDAPATAN', kind: AccountKind.PENDAPATAN, normal: K, postable: false,
    children: [
      { kode: '4-101', nama: 'Pendapatan Jasa Konsultansi', kind: AccountKind.PENDAPATAN, normal: K },
      { kode: '4-102', nama: 'Pendapatan Jasa Riset Pasar', kind: AccountKind.PENDAPATAN, normal: K },
      { kode: '4-103', nama: 'Pendapatan Pelatihan & Sertifikasi', kind: AccountKind.PENDAPATAN, normal: K },
      { kode: '4-104', nama: 'Pendapatan Event & Konferensi', kind: AccountKind.PENDAPATAN, normal: K },
      { kode: '4-105', nama: 'Pendapatan Iklan & Media (Marketeers)', kind: AccountKind.PENDAPATAN, normal: K },
      { kode: '4-190', nama: 'Diskon Penjualan', kind: AccountKind.PENDAPATAN, normal: D },
    ],
  },
  {
    kode: '5', nama: 'BEBAN POKOK JASA', kind: AccountKind.BEBAN_POKOK, normal: D, postable: false,
    children: [
      { kode: '5-101', nama: 'Beban Tenaga Ahli & Narasumber', kind: AccountKind.BEBAN_POKOK, normal: D },
      { kode: '5-102', nama: 'Beban Fieldwork & Enumerator', kind: AccountKind.BEBAN_POKOK, normal: D },
      { kode: '5-103', nama: 'Beban Venue, Akomodasi & Konsumsi Event', kind: AccountKind.BEBAN_POKOK, normal: D },
      { kode: '5-104', nama: 'Beban Produksi & Percetakan', kind: AccountKind.BEBAN_POKOK, normal: D },
      { kode: '5-105', nama: 'Beban Lisensi Data & Software Riset', kind: AccountKind.BEBAN_POKOK, normal: D },
    ],
  },
  {
    kode: '6', nama: 'BEBAN OPERASIONAL', kind: AccountKind.BEBAN, normal: D, postable: false,
    children: [
      { kode: '6-101', nama: 'Beban Gaji & Tunjangan', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-102', nama: 'Beban Sewa Kantor', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-103', nama: 'Beban Penyusutan', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-104', nama: 'Beban Pemasaran & Promosi', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-105', nama: 'Beban Listrik, Air & Internet', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-106', nama: 'Beban Administrasi & Umum', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-107', nama: 'Beban Perjalanan Dinas', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-108', nama: 'Beban Pajak (Non-Final)', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-109', nama: 'Beban Penyesuaian Persediaan', kind: AccountKind.BEBAN, normal: D },
      { kode: '6-110', nama: 'Beban Jasa Profesional', kind: AccountKind.BEBAN, normal: D },
    ],
  },
  {
    kode: '7', nama: 'PENDAPATAN LAIN-LAIN', kind: AccountKind.PENDAPATAN_LAIN, normal: K, postable: false,
    children: [
      { kode: '7-101', nama: 'Pendapatan Bunga Bank (Jasa Giro)', kind: AccountKind.PENDAPATAN_LAIN, normal: K },
      { kode: '7-102', nama: 'Laba Penjualan Aset', kind: AccountKind.PENDAPATAN_LAIN, normal: K },
      { kode: '7-103', nama: 'Pendapatan Penyesuaian Persediaan', kind: AccountKind.PENDAPATAN_LAIN, normal: K },
    ],
  },
  {
    kode: '8', nama: 'BEBAN LAIN-LAIN', kind: AccountKind.BEBAN_LAIN, normal: D, postable: false,
    children: [
      { kode: '8-101', nama: 'Beban Bunga Bank', kind: AccountKind.BEBAN_LAIN, normal: D },
      { kode: '8-102', nama: 'Beban Administrasi Bank', kind: AccountKind.BEBAN_LAIN, normal: D },
      { kode: '8-103', nama: 'Rugi Penjualan Aset', kind: AccountKind.BEBAN_LAIN, normal: D },
    ],
  },
  {
    kode: '9', nama: 'PAJAK PENGHASILAN', kind: AccountKind.BEBAN, normal: D, postable: false,
    children: [
      { kode: '9-101', nama: 'Beban PPh Badan (Tahun Berjalan)', kind: AccountKind.BEBAN, normal: D },
      { kode: '9-102', nama: 'Beban PPh Final', kind: AccountKind.BEBAN, normal: D },
    ],
  },
];

async function seedCoa(tenantId: string) {
  const map = new Map<string, string>();
  const insertNode = async (node: CoaNode, parentKode?: string): Promise<void> => {
    const isPostable = node.postable ?? !node.children;
    const acct = await prisma.account.create({
      data: {
        tenantId,
        parentId: parentKode ? map.get(parentKode) : null,
        kode: node.kode,
        nama: node.nama,
        kind: node.kind,
        normalBalance: node.normal,
        isPostable,
        saldoAwal: node.saldoAwal ?? '0',
      },
    });
    map.set(node.kode, acct.id);
    for (const child of node.children ?? []) await insertNode(child, node.kode);
  };
  for (const root of COA) await insertNode(root);
  return map;
}

async function seedTaxRates(tenantId: string, coa: Map<string, string>) {
  const tarif = [
    { kode: 'PPN-EFEKTIF-11', nama: 'PPN 12% (DPP nilai lain 11/12, efektif 11%)', tarif: '12', ppnSkema: PpnSkema.EFEKTIF_11, akunUtangKode: '2-1021', akunPiutangKode: '1-105' },
    { kode: 'PPN-EFEKTIF-12', nama: 'PPN 12% atas BKP mewah (DPP penuh)', tarif: '12', ppnSkema: PpnSkema.EFEKTIF_12, akunUtangKode: '2-1021', akunPiutangKode: '1-105' },
    { kode: 'PPH23-JASA', nama: 'PPh 23 atas Jasa (2%)', tarif: '2', ppnSkema: null, akunUtangKode: '2-1023', akunPiutangKode: null },
    { kode: 'PPH23-LAIN', nama: 'PPh 23 atas Dividen/Bunga/Royalti (15%)', tarif: '15', ppnSkema: null, akunUtangKode: '2-1023', akunPiutangKode: null },
    { kode: 'PPH4-SEWA', nama: 'PPh 4(2) Final atas Sewa Tanah/Bangunan (10%)', tarif: '10', ppnSkema: null, akunUtangKode: '2-1025', akunPiutangKode: null },
    { kode: 'PPH-BADAN', nama: 'PPh Badan (UU HPP, 22%)', tarif: '22', ppnSkema: null, akunUtangKode: '2-1024', akunPiutangKode: null },
  ];
  for (const t of tarif) {
    await prisma.taxRate.create({
      data: {
        tenantId, kode: t.kode, nama: t.nama, tarif: t.tarif, ppnSkema: t.ppnSkema,
        akunUtangId: t.akunUtangKode ? coa.get(t.akunUtangKode) : null,
        akunPiutangId: t.akunPiutangKode ? coa.get(t.akunPiutangKode) : null,
      },
    });
  }
}

async function seedPph23Tarif(tenantId: string) {
  const rows = [
    { kode: 'JASA-KONSULTAN', nama: 'Jasa konsultan', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-MANAJEMEN', nama: 'Jasa manajemen', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-TEKNIK', nama: 'Jasa teknik', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-EVENT', nama: 'Jasa penyelenggara kegiatan / event organizer', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-KATERING', nama: 'Jasa katering / tata boga', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-TENAGA-KERJA', nama: 'Jasa penyediaan tenaga kerja', tarif: '2', keterangan: 'PMK 141/2015 — enumerator/fieldwork' },
    { kode: 'JASA-SOFTWARE', nama: 'Jasa sehubungan software komputer', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-AKUNTAN', nama: 'Jasa akuntansi, pembukuan, audit', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'JASA-HUKUM', nama: 'Jasa hukum', tarif: '2', keterangan: 'PMK 141/2015' },
    { kode: 'SEWA-HARTA', nama: 'Sewa & penggunaan harta (selain tanah/bangunan)', tarif: '2', keterangan: 'PMK 141/2015' },
  ];
  for (const r of rows) {
    await prisma.pph23Tarif.create({ data: { tenantId, kode: r.kode, nama: r.nama, tarif: r.tarif, keterangan: r.keterangan } });
  }
}

// Item jasa (katalog) — dipakai sebagai referensi di baris faktur (isJasa=true → tanpa stok)
async function seedItems(tenantId: string, coa: Map<string, string>) {
  const items: Array<{ kode: string; nama: string; kategori: string; satuan: string; harga: string; pendapatanKode: string }> = [
    { kode: 'JSA-CONS', nama: 'Jasa Konsultansi Strategi Marketing', kategori: 'Consulting', satuan: 'Paket', harga: '350000000', pendapatanKode: '4-101' },
    { kode: 'JSA-ADVIS', nama: 'Jasa Advisory & Growth Strategy', kategori: 'Consulting', satuan: 'Paket', harga: '500000000', pendapatanKode: '4-101' },
    { kode: 'JSA-UAA', nama: 'Studi Usage & Attitude (U&A)', kategori: 'Research', satuan: 'Proyek', harga: '450000000', pendapatanKode: '4-102' },
    { kode: 'JSA-BHT', nama: 'Brand Health Tracking (per wave)', kategori: 'Research', satuan: 'Wave', harga: '300000000', pendapatanKode: '4-102' },
    { kode: 'JSA-CSAT', nama: 'Customer Satisfaction Survey', kategori: 'Research', satuan: 'Proyek', harga: '250000000', pendapatanKode: '4-102' },
    { kode: 'JSA-FEAS', nama: 'Feasibility Study & Market Sizing', kategori: 'Research', satuan: 'Proyek', harga: '400000000', pendapatanKode: '4-102' },
    { kode: 'JSA-TRPUB', nama: 'Public Training / Sertifikasi (per batch)', kategori: 'Institute', satuan: 'Batch', harga: '75000000', pendapatanKode: '4-103' },
    { kode: 'JSA-TRINH', nama: 'In-House Corporate Training', kategori: 'Institute', satuan: 'Program', harga: '120000000', pendapatanKode: '4-103' },
    { kode: 'JSA-EVENT', nama: 'Sponsorship & Partnership Konferensi', kategori: 'Event', satuan: 'Paket', harga: '250000000', pendapatanKode: '4-104' },
    { kode: 'JSA-MEDIA', nama: 'Iklan & Konten Marketeers', kategori: 'Media', satuan: 'Paket', harga: '60000000', pendapatanKode: '4-105' },
  ];
  const map = new Map<string, string>();
  for (const it of items) {
    const row = await prisma.item.create({
      data: {
        tenantId, kode: it.kode, nama: it.nama, kategori: it.kategori, satuan: it.satuan,
        hargaJualDefault: it.harga, klasifikasiPpn: KlasifikasiPpn.JKP, isJasa: true,
        akunPendapatanId: coa.get(it.pendapatanKode) ?? null,
      },
    });
    map.set(it.kode, row.id);
  }
  return map;
}

async function seedVendors(tenantId: string, coa: Map<string, string>) {
  const akunUtang = coa.get('2-101');
  const data: Array<{ kode: string; nama: string; npwp: string | null; isPkp: boolean; kategori: string; kota: string; telp: string; termin: number }> = [
    { kode: 'VEN-001', nama: 'PT Data Riset Nusantara', npwp: '031112223503000', isPkp: true, kategori: 'Fieldwork & Enumerator', kota: 'Jakarta', telp: '021-520-1010', termin: 30 },
    { kode: 'VEN-002', nama: 'CV Surveindo Lapangan', npwp: '051234567505000', isPkp: false, kategori: 'Fieldwork & Enumerator', kota: 'Surabaya', telp: '031-733-2200', termin: 14 },
    { kode: 'VEN-003', nama: 'Dr. Andreas Wijaya (Tenaga Ahli/Narasumber)', npwp: '062345678506000', isPkp: false, kategori: 'Tenaga Ahli / Narasumber', kota: 'Jakarta', telp: '0812-1000-2000', termin: 14 },
    { kode: 'VEN-004', nama: 'PT Kreasi Panel Indonesia', npwp: '042223334504000', isPkp: true, kategori: 'Lisensi Data & Software', kota: 'Jakarta', telp: '021-570-8080', termin: 30 },
    { kode: 'VEN-005', nama: 'PT Grand Ballroom Kasablanka', npwp: '093334445509000', isPkp: true, kategori: 'Venue & Akomodasi', kota: 'Jakarta', telp: '021-2941-1234', termin: 21 },
    { kode: 'VEN-006', nama: 'PT Cipta Boga Katering', npwp: '011122334501000', isPkp: true, kategori: 'Katering & Konsumsi', kota: 'Jakarta', telp: '021-830-4455', termin: 21 },
    { kode: 'VEN-007', nama: 'PT Cetak Warna Gemilang', npwp: '022233445502000', isPkp: true, kategori: 'Produksi & Percetakan', kota: 'Jakarta', telp: '021-612-7788', termin: 30 },
    { kode: 'VEN-008', nama: 'KAP Santoso, Wijaya & Rekan', npwp: '033344556603000', isPkp: true, kategori: 'Jasa Profesional (Audit)', kota: 'Jakarta', telp: '021-725-9100', termin: 30 },
    { kode: 'VEN-009', nama: 'Kantor Hukum Mahesa & Partners', npwp: '044455667704000', isPkp: true, kategori: 'Jasa Profesional (Hukum)', kota: 'Jakarta', telp: '021-390-6600', termin: 30 },
    { kode: 'VEN-010', nama: 'PT Properti Kasablanka (Sewa Kantor)', npwp: '055566778805000', isPkp: true, kategori: 'Sewa & Utilitas', kota: 'Jakarta', telp: '021-2946-8800', termin: 30 },
    { kode: 'VEN-011', nama: 'PT Solusi Cloud Teknologi', npwp: '066677889906000', isPkp: true, kategori: 'IT & Langganan Software', kota: 'Jakarta', telp: '021-500-1200', termin: 30 },
    { kode: 'VEN-012', nama: 'PT Travel Bisnis Sejahtera', npwp: '077788990007000', isPkp: true, kategori: 'Perjalanan Dinas', kota: 'Jakarta', telp: '021-345-6789', termin: 14 },
  ];
  const map = new Map<string, { id: string; isPkp: boolean; npwp: string | null }>();
  for (const v of data) {
    const row = await prisma.vendor.create({
      data: {
        tenantId, kode: v.kode, nama: v.nama, npwp: v.npwp, isPkp: v.isPkp, kategori: v.kategori,
        kota: v.kota, telp: v.telp, terminHari: v.termin, akunUtangId: akunUtang ?? null,
      },
    });
    map.set(v.kode, { id: row.id, isPkp: v.isPkp, npwp: v.npwp });
  }
  return map;
}

async function seedCustomers(tenantId: string, coa: Map<string, string>) {
  const akunPiutang = coa.get('1-103');
  const data: Array<{ kode: string; nama: string; npwp: string; isPkp: boolean; tipe: string; kota: string; termin: number; limit: string }> = [
    { kode: 'CST-001', nama: 'PT Bank Mandiri (Persero) Tbk', npwp: '012345678501000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '3000000000' },
    { kode: 'CST-002', nama: 'PT Telkomsel', npwp: '013345678502000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '3000000000' },
    { kode: 'CST-003', nama: 'PT Unilever Indonesia Tbk', npwp: '014345678503000', isPkp: true, tipe: 'KORPORAT', kota: 'Tangerang', termin: 30, limit: '2500000000' },
    { kode: 'CST-004', nama: 'PT Astra International Tbk', npwp: '015345678504000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '2500000000' },
    { kode: 'CST-005', nama: 'PT Bank Central Asia Tbk', npwp: '016345678505000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '2500000000' },
    { kode: 'CST-006', nama: 'PT Pertamina (Persero)', npwp: '017345678506000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 60, limit: '3000000000' },
    { kode: 'CST-007', nama: 'PT Gojek Indonesia', npwp: '018345678507000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 30, limit: '2000000000' },
    { kode: 'CST-008', nama: 'PT Sinar Mas Land', npwp: '019345678508000', isPkp: true, tipe: 'KORPORAT', kota: 'Tangerang', termin: 45, limit: '2000000000' },
    { kode: 'CST-009', nama: 'PT Kalbe Farma Tbk', npwp: '020345678509000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 30, limit: '1500000000' },
    { kode: 'CST-010', nama: 'PT Prudential Life Assurance', npwp: '021345678510000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '1500000000' },
    { kode: 'CST-011', nama: 'PT Indofood Sukses Makmur Tbk', npwp: '022345678511000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 30, limit: '2000000000' },
    { kode: 'CST-012', nama: 'PT XL Axiata Tbk', npwp: '023345678512000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '1500000000' },
    { kode: 'CST-013', nama: 'PT Bank Rakyat Indonesia Tbk', npwp: '024345678513000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 45, limit: '2500000000' },
    { kode: 'CST-014', nama: 'Universitas Prasetiya Mulya', npwp: '025345678514000', isPkp: true, tipe: 'KORPORAT', kota: 'Tangerang', termin: 30, limit: '800000000' },
    { kode: 'CST-015', nama: 'PT Erajaya Swasembada Tbk', npwp: '026345678515000', isPkp: true, tipe: 'KORPORAT', kota: 'Jakarta', termin: 30, limit: '1000000000' },
  ];
  const map = new Map<string, string>();
  for (const c of data) {
    const row = await prisma.customer.create({
      data: {
        tenantId, kode: c.kode, nama: c.nama, npwp: c.npwp, isPkp: c.isPkp,
        kota: c.kota, terminHari: c.termin, kreditLimit: c.limit, akunPiutangId: akunPiutang ?? null,
      },
    });
    map.set(c.kode, row.id);
  }
  return map;
}

async function seedFiscalYear(tenantId: string) {
  const fy = await prisma.fiscalYear.create({
    data: {
      tenantId, kode: String(YEAR),
      startDate: new Date(Date.UTC(YEAR, 0, 1)), endDate: new Date(Date.UTC(YEAR, 11, 31)),
      status: FiscalYearStatus.OPEN,
    },
  });
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  for (let m = 1; m <= 12; m++) {
    await prisma.fiscalPeriod.create({
      data: {
        tenantId, fiscalYearId: fy.id, no: m, label: `${bulan[m - 1]} ${YEAR}`,
        startDate: new Date(Date.UTC(YEAR, m - 1, 1)), endDate: new Date(Date.UTC(YEAR, m, 0)),
        status: PeriodStatus.OPEN, // semua OPEN saat seeding; driver menutup Jan–Mei di akhir
      },
    });
  }
  return fy.id;
}

const MASA: Record<KelompokAsetTetap, number> = {
  BANGUNAN_PERMANEN: 240, BANGUNAN_NON_PERMANEN: 120, KELOMPOK_I: 48, KELOMPOK_II: 96, KELOMPOK_III: 192, KELOMPOK_IV: 240,
};

async function seedAsetTetap(tenantId: string, cabangId: string, coa: Map<string, string>) {
  const akun = (k: string) => coa.get(k)!;
  const beban = akun('6-103');
  // akumulasi opening dipilih agar konsisten: akumulasi s/d Des 2025, lastDepresiasiPeriode='2025-12'
  // Total akumulasi opening per grup = saldoAwal akun akumulasi (1-203/205/207).
  const data: Array<{
    kode: string; nama: string; kelompok: KelompokAsetTetap; perolehan: string;
    harga: string; akumulasi: string; asetKode: string; akumKode: string;
  }> = [
    // Renovasi & Interior (1-202/1-203) total harga 1.2M, akum 360jt
    { kode: 'AT-001', nama: 'Renovasi & interior kantor pusat (Kasablanka)', kelompok: KelompokAsetTetap.BANGUNAN_NON_PERMANEN, perolehan: '2023-01-10', harga: '900000000', akumulasi: '270000000', asetKode: '1-202', akumKode: '1-203' },
    { kode: 'AT-002', nama: 'Renovasi kantor cabang Surabaya & Bandung', kelompok: KelompokAsetTetap.BANGUNAN_NON_PERMANEN, perolehan: '2023-07-01', harga: '300000000', akumulasi: '90000000', asetKode: '1-202', akumKode: '1-203' },
    // Kendaraan (1-204/1-205) total 900jt, akum 400jt
    { kode: 'AT-003', nama: 'Kendaraan operasional (3 unit)', kelompok: KelompokAsetTetap.KELOMPOK_II, perolehan: '2022-06-01', harga: '600000000', akumulasi: '287500000', asetKode: '1-204', akumKode: '1-205' },
    { kode: 'AT-004', nama: 'Kendaraan direksi (1 unit)', kelompok: KelompokAsetTetap.KELOMPOK_II, perolehan: '2023-09-01', harga: '300000000', akumulasi: '112500000', asetKode: '1-204', akumKode: '1-205' },
    // Peralatan & Perangkat (1-206/1-207) total 1.6M, akum 700jt
    { kode: 'AT-005', nama: 'Laptop, workstation & perangkat riset', kelompok: KelompokAsetTetap.KELOMPOK_I, perolehan: '2024-01-15', harga: '800000000', akumulasi: '325000000', asetKode: '1-206', akumKode: '1-207' },
    { kode: 'AT-006', nama: 'Server, jaringan & lisensi perangkat keras', kelompok: KelompokAsetTetap.KELOMPOK_I, perolehan: '2023-03-01', harga: '500000000', akumulasi: '291666667', asetKode: '1-206', akumKode: '1-207' },
    { kode: 'AT-007', nama: 'Furnitur & perlengkapan kantor', kelompok: KelompokAsetTetap.KELOMPOK_I, perolehan: '2023-01-20', harga: '300000000', akumulasi: '83333333', asetKode: '1-206', akumKode: '1-207' },
  ];
  const map = new Map<string, string>();
  for (const a of data) {
    const masa = MASA[a.kelompok];
    const nilaiBuku = (Number(a.harga) - Number(a.akumulasi)).toFixed(2);
    const perolehan = new Date(a.perolehan + 'T00:00:00Z');
    const mulai = new Date(Date.UTC(perolehan.getUTCFullYear(), perolehan.getUTCMonth() + 1, 1));
    const row = await prisma.asetTetap.create({
      data: {
        tenantId, cabangId, kode: a.kode, nama: a.nama, kelompok: a.kelompok, metode: MetodePenyusutan.GARIS_LURUS,
        tanggalPerolehan: perolehan, mulaiPenyusutan: mulai, hargaPerolehan: a.harga, nilaiResidu: '0',
        masaManfaatBulan: masa, akumulasiPenyusutan: a.akumulasi, nilaiBuku,
        lastDepresiasiPeriode: `${YEAR - 1}-12`,
        akunAsetId: akun(a.asetKode), akunAkumulasiId: akun(a.akumKode), akunBebanId: beban,
        status: AsetStatus.AKTIF,
      },
    });
    map.set(a.kode, row.id);
  }
  return map;
}

async function seedKaryawan(tenantId: string, cabang: Record<string, string>) {
  const data: Array<{ kode: string; nik: string; nama: string; jabatan: string; ptkp: PtkpStatus; gaji: string; tunj: string; bpjs: string; npwp: string | null; cab: string }> = [
    { kode: 'EMP-001', nik: '3171011203800001', nama: 'Hendrawan Kusuma', jabatan: 'Managing Director', ptkp: PtkpStatus.K_2, gaji: '55000000', tunj: '15000000', bpjs: '1200000', npwp: '271234561501000', cab: 'JKT' },
    { kode: 'EMP-002', nik: '3171012504850002', nama: 'Ratna Dewi Sari', jabatan: 'Director of Research (Insight)', ptkp: PtkpStatus.K_1, gaji: '38000000', tunj: '9000000', bpjs: '900000', npwp: '281234561502000', cab: 'JKT' },
    { kode: 'EMP-003', nik: '3171013006870003', nama: 'Bagus Prakoso', jabatan: 'Director of Consulting', ptkp: PtkpStatus.K_2, gaji: '38000000', tunj: '9000000', bpjs: '900000', npwp: '291234561503000', cab: 'JKT' },
    { kode: 'EMP-004', nik: '3171010107900004', nama: 'Nadia Paramita', jabatan: 'Senior Research Manager', ptkp: PtkpStatus.K_0, gaji: '22000000', tunj: '5000000', bpjs: '540000', npwp: '301234561504000', cab: 'JKT' },
    { kode: 'EMP-005', nik: '3171011511920005', nama: 'Farhan Maulana', jabatan: 'Management Consultant', ptkp: PtkpStatus.TK_0, gaji: '18000000', tunj: '4000000', bpjs: '440000', npwp: '311234561505000', cab: 'JKT' },
    { kode: 'EMP-006', nik: '3171010208930006', nama: 'Siti Aisyah', jabatan: 'Finance & Accounting Manager', ptkp: PtkpStatus.K_1, gaji: '20000000', tunj: '4500000', bpjs: '490000', npwp: '321234561506000', cab: 'JKT' },
    { kode: 'EMP-007', nik: '3171012009950007', nama: 'Rizal Firmansyah', jabatan: 'Research Analyst', ptkp: PtkpStatus.TK_0, gaji: '11000000', tunj: '2500000', bpjs: '270000', npwp: null, cab: 'JKT' },
    { kode: 'EMP-008', nik: '3578011803880008', nama: 'Dwi Lestari', jabatan: 'Branch Manager Surabaya', ptkp: PtkpStatus.K_2, gaji: '24000000', tunj: '6000000', bpjs: '600000', npwp: '331234561507000', cab: 'SBY' },
    { kode: 'EMP-009', nik: '3578012607960009', nama: 'Aditya Nugraha', jabatan: 'Consultant Surabaya', ptkp: PtkpStatus.TK_0, gaji: '13000000', tunj: '3000000', bpjs: '320000', npwp: null, cab: 'SBY' },
    { kode: 'EMP-010', nik: '3273010905890010', nama: 'Maya Puspita', jabatan: 'Branch Manager Bandung', ptkp: PtkpStatus.K_1, gaji: '24000000', tunj: '6000000', bpjs: '600000', npwp: '341234561508000', cab: 'BDG' },
    { kode: 'EMP-011', nik: '3273011407970011', nama: 'Yoga Pratama', jabatan: 'Research Executive Bandung', ptkp: PtkpStatus.TK_0, gaji: '12000000', tunj: '2800000', bpjs: '300000', npwp: null, cab: 'BDG' },
    { kode: 'EMP-012', nik: '3171012311940012', nama: 'Intan Permatasari', jabatan: 'Institute Program Manager', ptkp: PtkpStatus.K_0, gaji: '19000000', tunj: '4500000', bpjs: '470000', npwp: '351234561509000', cab: 'JKT' },
  ];
  const map = new Map<string, string>();
  for (const k of data) {
    const row = await prisma.karyawan.create({
      data: {
        tenantId, cabangId: cabang[k.cab], kode: k.kode, nik: k.nik, nama: k.nama, jabatan: k.jabatan,
        ptkpStatus: k.ptkp, jenisKaryawan: JenisKaryawan.PEGAWAI_TETAP, tanggalMasuk: new Date('2023-01-02'),
        gajiPokok: k.gaji, tunjanganTetap: k.tunj, iuranBpjsKaryawan: k.bpjs, npwp: k.npwp,
      },
    });
    map.set(k.kode, row.id);
  }
  return map;
}

async function seedProjects(
  tenantId: string, ownerId: string, coa: Map<string, string>, customers: Map<string, string>,
) {
  // Setiap proyek: kode, nama, customer, budgetTotal, budget cost per akun (hardBlock:false).
  const data: Array<{
    kode: string; nama: string; cst: string; mulai: string; selesai: string; budgetTotal: string;
    budgets: Array<{ akun: string; amountPerBulan: string; bulan: string[] }>;
  }> = [
    {
      kode: 'PRJ-2026-001', nama: 'Growth Strategy Advisory — Bank Mandiri', cst: 'CST-001', mulai: '2026-01-05', selesai: '2026-06-30', budgetTotal: '1500000000',
      budgets: [{ akun: '5-101', amountPerBulan: '80000000', bulan: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'] }],
    },
    {
      kode: 'PRJ-2026-002', nama: 'Brand Health Tracking 2026 — Telkomsel', cst: 'CST-002', mulai: '2026-01-10', selesai: '2026-12-31', budgetTotal: '1200000000',
      budgets: [{ akun: '5-102', amountPerBulan: '90000000', bulan: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'] }],
    },
    {
      kode: 'PRJ-2026-003', nama: 'U&A Study Personal Care — Unilever', cst: 'CST-003', mulai: '2026-02-01', selesai: '2026-05-31', budgetTotal: '450000000',
      budgets: [{ akun: '5-102', amountPerBulan: '70000000', bulan: ['2026-02', '2026-03', '2026-04', '2026-05'] }],
    },
    {
      kode: 'PRJ-2026-004', nama: 'Customer Satisfaction Survey — Pertamina', cst: 'CST-006', mulai: '2026-03-01', selesai: '2026-06-30', budgetTotal: '600000000',
      budgets: [{ akun: '5-102', amountPerBulan: '60000000', bulan: ['2026-03', '2026-04', '2026-05', '2026-06'] }],
    },
    {
      kode: 'PRJ-2026-005', nama: 'Market Entry Feasibility — Astra', cst: 'CST-004', mulai: '2026-02-15', selesai: '2026-06-30', budgetTotal: '500000000',
      budgets: [{ akun: '5-101', amountPerBulan: '50000000', bulan: ['2026-03', '2026-04', '2026-05'] }],
    },
    {
      kode: 'PRJ-2026-006', nama: 'MarkPlus Conference & Industry Roundtable 2026', cst: 'CST-005', mulai: '2026-01-15', selesai: '2026-06-30', budgetTotal: '900000000',
      budgets: [{ akun: '5-103', amountPerBulan: '120000000', bulan: ['2026-04', '2026-05', '2026-06'] }],
    },
    {
      kode: 'PRJ-2026-007', nama: 'Corporate Training Program — BCA', cst: 'CST-005', mulai: '2026-02-01', selesai: '2026-06-30', budgetTotal: '400000000',
      budgets: [{ akun: '5-101', amountPerBulan: '35000000', bulan: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'] }],
    },
    {
      kode: 'PRJ-2026-008', nama: 'Digital Marketing Advisory — Gojek', cst: 'CST-007', mulai: '2026-03-01', selesai: '2026-06-30', budgetTotal: '550000000',
      budgets: [{ akun: '5-105', amountPerBulan: '40000000', bulan: ['2026-03', '2026-04', '2026-05', '2026-06'] }],
    },
  ];
  const map = new Map<string, { id: string; cst: string }>();
  for (const p of data) {
    const proj = await prisma.project.create({
      data: {
        tenantId, kode: p.kode, nama: p.nama, tanggalMulai: new Date(p.mulai + 'T00:00:00Z'),
        tanggalSelesai: new Date(p.selesai + 'T00:00:00Z'), status: ProjectStatus.AKTIF,
        budgetTotal: p.budgetTotal, createdById: ownerId,
      },
    });
    await prisma.projectMember.create({ data: { projectId: proj.id, userId: ownerId, role: ProjectMemberRole.MANAGER } });
    for (const b of p.budgets) {
      for (const bln of b.bulan) {
        await prisma.budget.create({
          data: {
            tenantId, projectId: proj.id, accountId: coa.get(b.akun)!, periode: bln,
            amount: b.amountPerBulan, hardBlock: false, createdById: ownerId,
          },
        });
      }
    }
    map.set(p.kode, { id: proj.id, cst: p.cst });
  }
  return map;
}

async function main() {
  console.log(`🌱 Seeding ${TENANT_NAMA}...`);

  if (process.env.RESET === '1') {
    const existing = await prisma.tenant.findFirst({ where: { nama: TENANT_NAMA } });
    if (existing) {
      const t = existing.id;
      console.log(`  ⚠ RESET: menghapus data tenant lama ${t} (satu transaksi)...`);
      const w = { where: { tenantId: t } };
      // Semua delete dibungkus 1 transaksi supaya DEFERRED balance trigger
      // (trg_journal_lines_balance) hanya dievaluasi saat COMMIT (state final:
      // semua sudah terhapus konsisten). Urutan tetap anak→induk untuk FK immediate.
      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { project: { tenantId: t } } }),
        prisma.membershipCabang.deleteMany({ where: { membership: { tenantId: t } } }),
        prisma.stokLotKonsumsi.deleteMany(w),
        prisma.stokLot.deleteMany(w),
        prisma.stokMovement.deleteMany(w),
        prisma.journalLine.deleteMany(w),
        prisma.salesInvoiceLine.deleteMany(w),
        prisma.purchaseInvoiceLine.deleteMany(w),
        prisma.cashBankEntryLine.deleteMany(w),
        prisma.payrollLine.deleteMany(w),
        prisma.depresiasiLine.deleteMany(w),
        prisma.stokAdjustmentLine.deleteMany(w),
        prisma.saldoAwalAkunLine.deleteMany(w),
        prisma.buktiPotong.deleteMany(w),
        prisma.budget.deleteMany(w),
        prisma.itemStokAwal.deleteMany(w),
        prisma.cashBankEntry.deleteMany(w),
        prisma.salesInvoice.deleteMany(w),
        prisma.purchaseInvoice.deleteMany(w),
        prisma.payrollRun.deleteMany(w),
        prisma.depresiasiRun.deleteMany(w),
        prisma.stokAdjustment.deleteMany(w),
        prisma.journal.deleteMany(w),
        prisma.saldoAwal.deleteMany(w),
        prisma.asetTetap.deleteMany(w),
        prisma.project.deleteMany(w),
        prisma.karyawan.deleteMany(w),
        prisma.sequence.deleteMany(w),
        prisma.taxRate.deleteMany(w),
        prisma.pph23Tarif.deleteMany(w),
        prisma.glConfig.deleteMany(w),
        prisma.item.deleteMany(w),
        prisma.vendor.deleteMany(w),
        prisma.customer.deleteMany(w),
        prisma.fiscalPeriod.deleteMany(w),
        prisma.fiscalYear.deleteMany(w),
        prisma.auditLog.deleteMany(w),
        prisma.membership.deleteMany(w),
        prisma.account.deleteMany(w),
        prisma.cabang.deleteMany(w),
        prisma.tenant.delete({ where: { id: t } }),
      ]);
      console.log('  ✓ tenant lama dihapus');
    }
  } else {
    const dup = await prisma.tenant.findFirst({ where: { nama: TENANT_NAMA } });
    if (dup) { console.log('  ✗ Tenant sudah ada. Pakai RESET=1 untuk seed ulang. Batal.'); return; }
  }

  const tenant = await prisma.tenant.create({
    data: {
      nama: TENANT_NAMA, npwp: '099887766550000', isPkp: true, pkpNo: 'PKP-088/WPJ.07/2020',
      alamat: 'EightyEight@Kasablanka Lt. 8, Jl. Casablanca Raya Kav. 88, Jakarta 12870',
      email: 'finance@markplusindonesia.co.id', telp: '021-5150-5000',
    },
  });
  console.log(`  ✓ Tenant: ${tenant.nama} (${tenant.id})`);

  const cJkt = await prisma.cabang.create({ data: { tenantId: tenant.id, kode: 'JKT', nama: 'Kantor Pusat Jakarta', kodeCabangNpwp: '000', alamat: 'EightyEight@Kasablanka Lt. 8, Jakarta', isPusat: true } });
  const cSby = await prisma.cabang.create({ data: { tenantId: tenant.id, kode: 'SBY', nama: 'Cabang Surabaya', kodeCabangNpwp: '001', npwpCabang: '099887766550001', alamat: 'Jl. Basuki Rahmat 8-12, Surabaya' } });
  const cBdg = await prisma.cabang.create({ data: { tenantId: tenant.id, kode: 'BDG', nama: 'Cabang Bandung', kodeCabangNpwp: '002', npwpCabang: '099887766550002', alamat: 'Jl. Ir. H. Juanda 100, Bandung' } });
  const cabang = { JKT: cJkt.id, SBY: cSby.id, BDG: cBdg.id };
  console.log('  ✓ Cabang: JKT (pusat), SBY, BDG');

  const coa = await seedCoa(tenant.id);
  console.log(`  ✓ COA: ${coa.size} akun`);
  await seedTaxRates(tenant.id, coa);
  await seedPph23Tarif(tenant.id);
  console.log('  ✓ Tarif pajak + PPh 23');

  const items = await seedItems(tenant.id, coa);
  const vendors = await seedVendors(tenant.id, coa);
  const customers = await seedCustomers(tenant.id, coa);
  console.log(`  ✓ Items: ${items.size}, Vendors: ${vendors.size}, Customers: ${customers.size}`);

  const fyId = await seedFiscalYear(tenant.id);
  console.log('  ✓ FiscalYear 2026 (12 periode, semua OPEN)');

  const aset = await seedAsetTetap(tenant.id, cabang.JKT, coa);
  const karyawan = await seedKaryawan(tenant.id, cabang);
  console.log(`  ✓ Aset tetap: ${aset.size}, Karyawan: ${karyawan.size}`);

  // Users
  const passwordHash = await argon2.hash('markplus123', { type: argon2.argon2id });
  const owner = await prisma.user.upsert({
    where: { email: 'demo@markplusindonesia.co.id' },
    create: { email: 'demo@markplusindonesia.co.id', nama: 'Admin MarkPlus (Demo)', passwordHash },
    update: { passwordHash },
  });
  const akuntan = await prisma.user.upsert({
    where: { email: 'akuntan@markplusindonesia.co.id' },
    create: { email: 'akuntan@markplusindonesia.co.id', nama: 'Siti Aisyah (Akuntan)', passwordHash },
    update: { passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    create: { userId: owner.id, tenantId: tenant.id, role: Role.OWNER },
    update: { role: Role.OWNER },
  });
  const akMem = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: akuntan.id, tenantId: tenant.id } },
    create: { userId: akuntan.id, tenantId: tenant.id, role: Role.AKUNTAN },
    update: { role: Role.AKUNTAN },
  });
  await prisma.membershipCabang.upsert({
    where: { membershipId_cabangId: { membershipId: akMem.id, cabangId: cabang.JKT } },
    create: { membershipId: akMem.id, cabangId: cabang.JKT }, update: {},
  });
  console.log('  ✓ Users: demo@markplusindonesia.co.id (OWNER), akuntan@… (AKUNTAN) — pwd markplus123');

  const projects = await seedProjects(tenant.id, owner.id, coa, customers);
  console.log(`  ✓ Projects: ${projects.size} (dengan budget bulanan hardBlock=false)`);

  // ---------- Manifest untuk driver API
  const manifest = {
    tenantId: tenant.id,
    tenantNama: tenant.nama,
    fiscalYearId: fyId,
    login: { email: 'demo@markplusindonesia.co.id', password: 'markplus123' },
    cabang,
    accounts: Object.fromEntries(coa),
    items: Object.fromEntries(items),
    vendors: Object.fromEntries([...vendors].map(([k, v]) => [k, v])),
    customers: Object.fromEntries(customers),
    projects: Object.fromEntries([...projects].map(([k, v]) => [k, v])),
    karyawan: Object.fromEntries(karyawan),
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Master seed selesai. Manifest → ${MANIFEST_PATH}\n`);
}

main()
  .catch((e) => { console.error('❌ Seed gagal:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
