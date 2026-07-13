/**
 * Seed Lentera — Fase 1
 *  - 1 tenant demo: PT Sinar Niaga Sentosa (distribusi pangan, Semarang)
 *  - 2 cabang: Semarang (pusat) + Surabaya
 *  - 2 user: owner@lentera.id + akuntan@lentera.id
 *  - COA standar (turunan dari Akuntansi.dc.html coaTree)
 *  - Tarif pajak default: PPN 12%/efektif 11%, PPh 23 jasa 2%, PPh 21 (placeholder)
 *
 * Idempotent: pakai upsert by unique key supaya bisa di-rerun.
 */

import {
  PrismaClient,
  AccountKind,
  NormalBalance,
  PpnSkema,
  Role,
  KlasifikasiPpn,
  TipeCustomer,
  PeriodStatus,
  FiscalYearStatus,
  KelompokAsetTetap,
  MetodePenyusutan,
  AsetStatus,
  PtkpStatus,
  JenisKaryawan,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

// ===============================================================
// COA standar — disusun mengikuti praktik akuntansi Indonesia
// untuk perusahaan dagang (distribusi pangan).
// ===============================================================

type CoaNode = {
  kode: string;
  nama: string;
  kind: AccountKind;
  normal: NormalBalance;
  postable?: boolean; // default = !children
  saldoAwal?: string;
  children?: CoaNode[];
};

const COA: CoaNode[] = [
  {
    kode: '1', nama: 'ASET', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, postable: false,
    children: [
      {
        kode: '1-10', nama: 'Aset Lancar', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, postable: false,
        children: [
          { kode: '1-101', nama: 'Kas', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '85000000' },
          {
            kode: '1-102', nama: 'Bank', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, postable: false,
            children: [
              { kode: '1-1021', nama: 'Bank BCA', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '320000000' },
              { kode: '1-1022', nama: 'Bank Mandiri', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '100000000' },
            ],
          },
          { kode: '1-103', nama: 'Piutang Usaha', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '310000000' },
          { kode: '1-104', nama: 'Persediaan Barang Dagang', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '540000000' },
          { kode: '1-105', nama: 'PPN Masukan', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '24000000' },
          { kode: '1-106', nama: 'Beban Dibayar Dimuka', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, saldoAwal: '36000000' },
          { kode: '1-107', nama: 'PPh 23/25 Dibayar Dimuka', kind: AccountKind.ASET, normal: NormalBalance.DEBIT },
        ],
      },
      {
        kode: '1-20', nama: 'Aset Tetap', kind: AccountKind.ASET, normal: NormalBalance.DEBIT, postable: false,
        children: [
          { kode: '1-201', nama: 'Tanah', kind: AccountKind.ASET, normal: NormalBalance.DEBIT },
          { kode: '1-202', nama: 'Bangunan', kind: AccountKind.ASET, normal: NormalBalance.DEBIT },
          { kode: '1-203', nama: 'Akumulasi Penyusutan Bangunan', kind: AccountKind.ASET, normal: NormalBalance.KREDIT },
          { kode: '1-204', nama: 'Kendaraan', kind: AccountKind.ASET, normal: NormalBalance.DEBIT },
          { kode: '1-205', nama: 'Akumulasi Penyusutan Kendaraan', kind: AccountKind.ASET, normal: NormalBalance.KREDIT },
          { kode: '1-206', nama: 'Peralatan & Mesin', kind: AccountKind.ASET, normal: NormalBalance.DEBIT },
          { kode: '1-207', nama: 'Akumulasi Penyusutan Peralatan & Mesin', kind: AccountKind.ASET, normal: NormalBalance.KREDIT },
        ],
      },
    ],
  },
  {
    kode: '2', nama: 'LIABILITAS', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT, postable: false,
    children: [
      {
        kode: '2-10', nama: 'Liabilitas Jangka Pendek', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT, postable: false,
        children: [
          { kode: '2-101', nama: 'Utang Usaha', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT, saldoAwal: '268000000' },
          {
            kode: '2-102', nama: 'Utang Pajak', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT, postable: false,
            children: [
              { kode: '2-1021', nama: 'Utang PPN Keluaran', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
              { kode: '2-1022', nama: 'Utang PPh 21', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
              { kode: '2-1023', nama: 'Utang PPh 23', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
              { kode: '2-1024', nama: 'Utang PPh 25/29', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
              { kode: '2-1025', nama: 'Utang PPh 4(2) Final', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
            ],
          },
          { kode: '2-106', nama: 'Utang BPJS Karyawan', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
          { kode: '2-107', nama: 'Utang BPJS Pemberi Kerja', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
          { kode: '2-110', nama: 'Beban Yang Masih Harus Dibayar', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
          { kode: '2-111', nama: 'Pendapatan Diterima Dimuka', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
        ],
      },
      {
        kode: '2-20', nama: 'Liabilitas Jangka Panjang', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT, postable: false,
        children: [
          { kode: '2-201', nama: 'Utang Bank', kind: AccountKind.LIABILITAS, normal: NormalBalance.KREDIT },
        ],
      },
    ],
  },
  {
    kode: '3', nama: 'EKUITAS', kind: AccountKind.EKUITAS, normal: NormalBalance.KREDIT, postable: false,
    children: [
      { kode: '3-101', nama: 'Modal Disetor', kind: AccountKind.EKUITAS, normal: NormalBalance.KREDIT, saldoAwal: '1000000000' },
      { kode: '3-102', nama: 'Saldo Laba (Ditahan)', kind: AccountKind.EKUITAS, normal: NormalBalance.KREDIT, saldoAwal: '380000000' },
      { kode: '3-103', nama: 'Ikhtisar Laba Rugi', kind: AccountKind.EKUITAS, normal: NormalBalance.KREDIT },
      { kode: '3-104', nama: 'Prive / Dividen', kind: AccountKind.EKUITAS, normal: NormalBalance.DEBIT },
    ],
  },
  {
    kode: '4', nama: 'PENDAPATAN', kind: AccountKind.PENDAPATAN, normal: NormalBalance.KREDIT, postable: false,
    children: [
      { kode: '4-101', nama: 'Penjualan Barang Dagang', kind: AccountKind.PENDAPATAN, normal: NormalBalance.KREDIT },
      { kode: '4-102', nama: 'Pendapatan Jasa', kind: AccountKind.PENDAPATAN, normal: NormalBalance.KREDIT },
      { kode: '4-103', nama: 'Retur Penjualan', kind: AccountKind.PENDAPATAN, normal: NormalBalance.DEBIT },
      { kode: '4-104', nama: 'Potongan Penjualan', kind: AccountKind.PENDAPATAN, normal: NormalBalance.DEBIT },
    ],
  },
  {
    kode: '5', nama: 'BEBAN POKOK', kind: AccountKind.BEBAN_POKOK, normal: NormalBalance.DEBIT, postable: false,
    children: [
      { kode: '5-101', nama: 'Beban Pokok Penjualan (HPP)', kind: AccountKind.BEBAN_POKOK, normal: NormalBalance.DEBIT },
      { kode: '5-102', nama: 'Retur Pembelian', kind: AccountKind.BEBAN_POKOK, normal: NormalBalance.KREDIT },
      { kode: '5-103', nama: 'Ongkos Angkut Pembelian', kind: AccountKind.BEBAN_POKOK, normal: NormalBalance.DEBIT },
    ],
  },
  {
    kode: '6', nama: 'BEBAN OPERASIONAL', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT, postable: false,
    children: [
      { kode: '6-101', nama: 'Beban Gaji & Tunjangan', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-102', nama: 'Beban Sewa', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-103', nama: 'Beban Penyusutan', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-104', nama: 'Beban Pemasaran', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-105', nama: 'Beban Listrik & Utilitas', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-106', nama: 'Beban Administrasi & Umum', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-107', nama: 'Beban Pengiriman', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-108', nama: 'Beban Pajak (Non-Final)', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '6-109', nama: 'Beban Penyesuaian Persediaan', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
    ],
  },
  {
    kode: '7', nama: 'PENDAPATAN LAIN-LAIN', kind: AccountKind.PENDAPATAN_LAIN, normal: NormalBalance.KREDIT, postable: false,
    children: [
      { kode: '7-101', nama: 'Pendapatan Bunga Bank', kind: AccountKind.PENDAPATAN_LAIN, normal: NormalBalance.KREDIT },
      { kode: '7-102', nama: 'Laba Selisih Kurs', kind: AccountKind.PENDAPATAN_LAIN, normal: NormalBalance.KREDIT },
      { kode: '7-103', nama: 'Pendapatan Penyesuaian Persediaan', kind: AccountKind.PENDAPATAN_LAIN, normal: NormalBalance.KREDIT },
    ],
  },
  {
    kode: '8', nama: 'BEBAN LAIN-LAIN', kind: AccountKind.BEBAN_LAIN, normal: NormalBalance.DEBIT, postable: false,
    children: [
      { kode: '8-101', nama: 'Beban Bunga Bank', kind: AccountKind.BEBAN_LAIN, normal: NormalBalance.DEBIT },
      { kode: '8-102', nama: 'Beban Administrasi Bank', kind: AccountKind.BEBAN_LAIN, normal: NormalBalance.DEBIT },
      { kode: '8-103', nama: 'Rugi Selisih Kurs', kind: AccountKind.BEBAN_LAIN, normal: NormalBalance.DEBIT },
    ],
  },
  {
    kode: '9', nama: 'PAJAK PENGHASILAN', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT, postable: false,
    children: [
      { kode: '9-101', nama: 'Beban PPh Badan (Tahun Berjalan)', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
      { kode: '9-102', nama: 'Beban PPh Final (UMKM)', kind: AccountKind.BEBAN, normal: NormalBalance.DEBIT },
    ],
  },
];

async function seedCoa(tenantId: string) {
  const map = new Map<string, string>(); // kode → id

  const insertNode = async (node: CoaNode, parentKode?: string): Promise<void> => {
    const isPostable = node.postable ?? !node.children;
    const acct = await prisma.account.upsert({
      where: { tenantId_kode: { tenantId, kode: node.kode } },
      create: {
        tenantId,
        parentId: parentKode ? map.get(parentKode) : null,
        kode: node.kode,
        nama: node.nama,
        kind: node.kind,
        normalBalance: node.normal,
        isPostable,
        saldoAwal: node.saldoAwal ?? '0',
      },
      update: {
        nama: node.nama,
        kind: node.kind,
        normalBalance: node.normal,
        isPostable,
        parentId: parentKode ? map.get(parentKode) : null,
      },
    });
    map.set(node.kode, acct.id);
    for (const child of node.children ?? []) {
      await insertNode(child, node.kode);
    }
  };

  for (const root of COA) await insertNode(root);
  return map;
}

async function seedTaxRates(tenantId: string, coa: Map<string, string>) {
  const tarif = [
    {
      kode: 'PPN-EFEKTIF-11',
      nama: 'PPN 12% (DPP nilai lain 11/12, efektif 11%)',
      tarif: '12',
      ppnSkema: PpnSkema.EFEKTIF_11,
      akunUtangKode: '2-1021',
      akunPiutangKode: '1-105',
    },
    {
      kode: 'PPN-EFEKTIF-12',
      nama: 'PPN 12% atas BKP mewah (DPP penuh)',
      tarif: '12',
      ppnSkema: PpnSkema.EFEKTIF_12,
      akunUtangKode: '2-1021',
      akunPiutangKode: '1-105',
    },
    {
      kode: 'PPH23-JASA',
      nama: 'PPh 23 atas Jasa (2%)',
      tarif: '2',
      ppnSkema: null,
      akunUtangKode: '2-1023',
      akunPiutangKode: null,
    },
    {
      kode: 'PPH23-LAIN',
      nama: 'PPh 23 atas Dividen/Bunga/Royalti (15%)',
      tarif: '15',
      ppnSkema: null,
      akunUtangKode: '2-1023',
      akunPiutangKode: null,
    },
    {
      kode: 'PPH4-SEWA',
      nama: 'PPh 4(2) Final atas Sewa Tanah/Bangunan (10%)',
      tarif: '10',
      ppnSkema: null,
      akunUtangKode: '2-1025',
      akunPiutangKode: null,
    },
    {
      kode: 'PPH-BADAN',
      nama: 'PPh Badan (UU HPP, 22%)',
      tarif: '22',
      ppnSkema: null,
      akunUtangKode: '2-1024',
      akunPiutangKode: null,
    },
  ];

  for (const t of tarif) {
    await prisma.taxRate.upsert({
      where: { tenantId_kode: { tenantId, kode: t.kode } },
      create: {
        tenantId,
        kode: t.kode,
        nama: t.nama,
        tarif: t.tarif,
        ppnSkema: t.ppnSkema,
        akunUtangId: t.akunUtangKode ? coa.get(t.akunUtangKode) : null,
        akunPiutangId: t.akunPiutangKode ? coa.get(t.akunPiutangKode) : null,
      },
      update: {
        nama: t.nama,
        tarif: t.tarif,
        ppnSkema: t.ppnSkema,
      },
    });
  }
}

// ===============================================================
// Master tarif PPh 23 — referensi jenis jasa (UU PPh Pasal 23 + PMK 141/2015)
// ===============================================================
async function seedIndustri(tenantId: string) {
  const rows = [
    { kode: 'AUTOMOTIVE', nama: 'Otomotif' },
    { kode: 'FMCG', nama: 'Barang Konsumen (FMCG)' },
    { kode: 'BANKING', nama: 'Perbankan' },
    { kode: 'FINANCE', nama: 'Jasa Keuangan & Asuransi' },
    { kode: 'TELCO', nama: 'Telekomunikasi' },
    { kode: 'RETAIL', nama: 'Ritel & E-commerce' },
    { kode: 'MANUFACTURING', nama: 'Manufaktur' },
    { kode: 'TECH', nama: 'Teknologi & Digital' },
    { kode: 'ENERGY', nama: 'Energi & Pertambangan' },
    { kode: 'HEALTHCARE', nama: 'Kesehatan & Farmasi' },
    { kode: 'PROPERTY', nama: 'Properti & Konstruksi' },
    { kode: 'FNB', nama: 'Makanan & Minuman' },
    { kode: 'MEDIA', nama: 'Media & Hiburan' },
    { kode: 'LOGISTICS', nama: 'Transportasi & Logistik' },
    { kode: 'GOVERNMENT', nama: 'Pemerintah & BUMN' },
    { kode: 'EDUCATION', nama: 'Pendidikan' },
  ];
  for (const r of rows) {
    await prisma.industri.upsert({
      where: { tenantId_kode: { tenantId, kode: r.kode } },
      create: { tenantId, kode: r.kode, nama: r.nama },
      update: { nama: r.nama },
    });
  }
}

async function seedPph23Tarif(tenantId: string) {
  const rows = [
    // 15% — pasif income (UU PPh Pasal 23 ayat 1a)
    { kode: 'DIVIDEN',              nama: 'Dividen (WP Badan, kepemilikan <25%)',                tarif: '15', keterangan: 'Pasal 23(1)a UU PPh' },
    { kode: 'BUNGA',                nama: 'Bunga & imbalan sehubungan jaminan utang',           tarif: '15', keterangan: 'Kecuali obligasi via bursa & deposito bank' },
    { kode: 'ROYALTI',              nama: 'Royalti',                                             tarif: '15', keterangan: 'Pasal 23(1)a UU PPh' },
    { kode: 'HADIAH-PENGHARGAAN',   nama: 'Hadiah, penghargaan, bonus',                          tarif: '15', keterangan: 'Selain yang dipotong PPh 21' },

    // 2% — jasa (UU PPh Pasal 23 ayat 1c + PMK 141/2015)
    { kode: 'SEWA-HARTA',           nama: 'Sewa & penggunaan harta (selain tanah/bangunan)',    tarif: '2',  keterangan: 'Sewa tanah/bangunan → PPh 4(2)' },
    { kode: 'JASA-TEKNIK',          nama: 'Jasa teknik',                                         tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-MANAJEMEN',       nama: 'Jasa manajemen',                                      tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-KONSULTAN',       nama: 'Jasa konsultan',                                      tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-KONSTRUKSI',      nama: 'Jasa konstruksi',                                     tarif: '2',  keterangan: 'PMK 141/2015 (bukan sektor jasa konstruksi bersertifikat)' },
    { kode: 'JASA-AKUNTAN',         nama: 'Jasa akuntansi, pembukuan, audit',                   tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-HUKUM',           nama: 'Jasa hukum',                                          tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-ARSITEK',         nama: 'Jasa arsitektur & perancang',                         tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-PERANTARA',       nama: 'Jasa perantara & keagenan',                           tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-INSTALASI',       nama: 'Jasa instalasi/pemasangan mesin/listrik/AC/TV kabel', tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-PERAWATAN',       nama: 'Jasa perawatan/perbaikan/pemeliharaan',              tarif: '2',  keterangan: 'PMK 141/2015 — mesin, gedung, kendaraan' },
    { kode: 'JASA-MAKLON',          nama: 'Jasa maklon (jasa pekerja)',                          tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-CLEANING',        nama: 'Jasa kebersihan (cleaning service)',                  tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-KATERING',        nama: 'Jasa katering / tata boga',                           tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-EVENT',           nama: 'Jasa penyelenggara kegiatan / event organizer',       tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-SOFTWARE',        nama: 'Jasa sehubungan software komputer',                   tarif: '2',  keterangan: 'PMK 141/2015 — kecuali penjualan lisensi (royalti = 15%)' },
    { kode: 'JASA-TENAGA-KERJA',    nama: 'Jasa penyediaan tenaga kerja',                        tarif: '2',  keterangan: 'PMK 141/2015 — outsourcing' },
    { kode: 'JASA-LOGISTIK',        nama: 'Jasa freight forwarding / logistik',                  tarif: '2',  keterangan: 'PMK 141/2015' },
    { kode: 'JASA-KEAMANAN',        nama: 'Jasa penyelidikan & keamanan',                        tarif: '2',  keterangan: 'PMK 141/2015' },
  ];

  for (const r of rows) {
    await prisma.pph23Tarif.upsert({
      where: { tenantId_kode: { tenantId, kode: r.kode } },
      create: {
        tenantId,
        kode: r.kode,
        nama: r.nama,
        tarif: r.tarif,
        keterangan: r.keterangan,
      },
      update: { nama: r.nama, tarif: r.tarif, keterangan: r.keterangan },
    });
  }
}

// ===============================================================
// Master Barang — selaras dengan mBarang di Akuntansi.dc.html
// ===============================================================

async function seedItems(tenantId: string, coa: Map<string, string>) {
  const akunPendapatan = coa.get('4-101'); // Penjualan Barang Dagang
  const akunPersediaan = coa.get('1-104'); // Persediaan Barang Dagang
  const akunHpp = coa.get('5-101');         // HPP

  const akunPendapatanJasa = coa.get('4-102'); // Pendapatan Jasa
  const akunBebanJasa = coa.get('6-106');      // Beban Administrasi & Umum (default beban utk jasa yg dibeli)

  const barang: Array<{
    kode: string;
    nama: string;
    kategori: string;
    satuan: string;
    harga: string;
    klasifikasi?: KlasifikasiPpn;
    isJasa?: boolean;
  }> = [
    { kode: 'BRG-001', nama: 'Beras Premium 25 kg', kategori: 'Sembako', satuan: 'Sak', harga: '360000', klasifikasi: KlasifikasiPpn.BKP_STRATEGIS },
    { kode: 'BRG-002', nama: 'Minyak Goreng 2 L', kategori: 'Sembako', satuan: 'Karton', harga: '42000', klasifikasi: KlasifikasiPpn.BKP },
    { kode: 'BRG-003', nama: 'Gula Pasir 50 kg', kategori: 'Sembako', satuan: 'Sak', harga: '760000', klasifikasi: KlasifikasiPpn.BKP_STRATEGIS },
    { kode: 'BRG-004', nama: 'Tepung Terigu 25 kg', kategori: 'Sembako', satuan: 'Sak', harga: '285000', klasifikasi: KlasifikasiPpn.BKP },
    { kode: 'BRG-005', nama: 'Kardus Distribusi', kategori: 'Kemasan', satuan: 'Pcs', harga: '4500', klasifikasi: KlasifikasiPpn.BKP },
    { kode: 'BRG-006', nama: 'Telur Ayam Negeri', kategori: 'Sembako', satuan: 'Tray', harga: '58000', klasifikasi: KlasifikasiPpn.BKP_STRATEGIS },
    { kode: 'JSA-001', nama: 'Jasa Pengiriman & Distribusi', kategori: 'Jasa', satuan: 'Job', harga: '25000000', klasifikasi: KlasifikasiPpn.JKP, isJasa: true },
    { kode: 'JSA-002', nama: 'Jasa Pergudangan (Storage) Bulanan', kategori: 'Jasa', satuan: 'Bulan', harga: '15000000', klasifikasi: KlasifikasiPpn.JKP, isJasa: true },
  ];

  for (const b of barang) {
    const pendapatanId = b.isJasa ? akunPendapatanJasa : akunPendapatan;
    await prisma.item.upsert({
      where: { tenantId_kode: { tenantId, kode: b.kode } },
      create: {
        tenantId,
        kode: b.kode,
        nama: b.nama,
        kategori: b.kategori,
        satuan: b.satuan,
        hargaJualDefault: b.harga,
        klasifikasiPpn: b.klasifikasi ?? KlasifikasiPpn.BKP,
        isJasa: b.isJasa ?? false,
        akunPendapatanId: pendapatanId ?? null,
        akunPersediaanId: b.isJasa ? null : (akunPersediaan ?? null),
        akunHppId: b.isJasa ? null : (akunHpp ?? null),
        akunBebanId: b.isJasa ? (akunBebanJasa ?? null) : null,
      },
      update: {
        nama: b.nama,
        hargaJualDefault: b.harga,
        klasifikasiPpn: b.klasifikasi ?? KlasifikasiPpn.BKP,
        isJasa: b.isJasa ?? false,
        akunBebanId: b.isJasa ? (akunBebanJasa ?? null) : null,
      },
    });
  }
  return barang.length;
}

async function seedItemStokAwal(
  tenantId: string,
  cabangId: string,
  tanggal: Date,
) {
  const stok: Array<{ kode: string; qty: string; hpp: string }> = [
    { kode: 'BRG-001', qty: '420', hpp: '295000' },
    { kode: 'BRG-002', qty: '880', hpp: '34000' },
    { kode: 'BRG-003', qty: '150', hpp: '640000' },
    { kode: 'BRG-004', qty: '310', hpp: '232000' },
    { kode: 'BRG-005', qty: '5200', hpp: '3500' },
    { kode: 'BRG-006', qty: '240', hpp: '48000' },
  ];
  for (const s of stok) {
    const item = await prisma.item.findUnique({
      where: { tenantId_kode: { tenantId, kode: s.kode } },
    });
    if (!item) continue;
    const isa = await prisma.itemStokAwal.upsert({
      where: {
        itemId_cabangId_tanggal: {
          itemId: item.id,
          cabangId,
          tanggal,
        },
      },
      create: {
        tenantId,
        itemId: item.id,
        cabangId,
        qty: s.qty,
        hargaPokokPerUnit: s.hpp,
        tanggal,
      },
      update: { qty: s.qty, hargaPokokPerUnit: s.hpp },
    });

    // Buat StokMovement STOK_AWAL — idempotent: cek dulu apakah sudah ada.
    const exist = await prisma.stokMovement.findFirst({
      where: { sumberType: 'STOK_AWAL', sumberId: isa.id },
    });
    if (exist) continue;

    const qty = Number(s.qty);
    const hpp = Number(s.hpp);
    await prisma.stokMovement.create({
      data: {
        tenantId,
        itemId: item.id,
        cabangId,
        tanggal,
        tipe: 'STOK_AWAL',
        qtyIn: s.qty,
        qtyOut: '0',
        hargaPokok: s.hpp,
        nilai: String(qty * hpp),
        saldoQty: s.qty,
        saldoNilai: String(qty * hpp),
        sumberType: 'STOK_AWAL',
        sumberId: isa.id,
        keterangan: 'Saldo awal saat onboarding',
      },
    });
    // Untuk FIFO support: tambah ke StokLot juga (idempotent).
    await prisma.stokLot.create({
      data: {
        tenantId,
        itemId: item.id,
        cabangId,
        tanggalMasuk: tanggal,
        qtyMasuk: s.qty,
        qtyTerpakai: '0',
        hargaPokok: s.hpp,
        movementMasukId: (await prisma.stokMovement.findFirstOrThrow({
          where: { sumberType: 'STOK_AWAL', sumberId: isa.id },
        })).id,
      },
    }).catch(() => undefined); // ignore kalau sudah ada (FIFO seed dijalankan ulang)
  }
}

// ===============================================================
// Vendor — pemasok PT Sinar Niaga
// ===============================================================

async function seedVendors(tenantId: string, coa: Map<string, string>) {
  const akunUtang = coa.get('2-101');
  const data = [
    { kode: 'VEN-001', nama: 'PT Pangan Makmur Sentosa', npwp: '031112223503000', isPkp: true, kategori: 'Barang Dagang', kota: 'Surabaya', telp: '031-555-1020', terminHari: 30 },
    { kode: 'VEN-002', nama: 'Sumber Beras Tani', npwp: '051234567505000', isPkp: false, kategori: 'Barang Dagang', kota: 'Solo', telp: '0271-640-220', terminHari: 14 },
    { kode: 'VEN-003', nama: 'CV Kemasan Prima', npwp: '062345678506000', isPkp: true, kategori: 'Kemasan', kota: 'Semarang', telp: '024-760-330', terminHari: 30 },
    { kode: 'VEN-004', nama: 'KAP Wijaya & Rekan', npwp: '042223334504000', isPkp: true, kategori: 'Jasa', kota: 'Jakarta', telp: '021-720-9100', terminHari: 30 },
    { kode: 'VEN-005', nama: 'Bersih Sentosa Servis', npwp: '093334445509000', isPkp: false, kategori: 'Jasa', kota: 'Semarang', telp: '024-330-7711', terminHari: 14 },
  ];
  for (const v of data) {
    await prisma.vendor.upsert({
      where: { tenantId_kode: { tenantId, kode: v.kode } },
      create: {
        tenantId,
        kode: v.kode,
        nama: v.nama,
        npwp: v.npwp,
        isPkp: v.isPkp,
        kategori: v.kategori,
        kota: v.kota,
        telp: v.telp,
        terminHari: v.terminHari,
        akunUtangId: akunUtang ?? null,
      },
      update: { nama: v.nama, isPkp: v.isPkp, terminHari: v.terminHari },
    });
  }
  return data.length;
}

// ===============================================================
// Customer — pelanggan PT Sinar Niaga
// ===============================================================

async function seedCustomers(tenantId: string, coa: Map<string, string>) {
  const akunPiutang = coa.get('1-103');
  const data: Array<{
    kode: string; nama: string; npwp: string | null; isPkp: boolean;
    tipe: TipeCustomer; kota: string; telp: string; terminHari: number; kreditLimit: string;
  }> = [
    { kode: 'PLG-001', nama: 'CV Berkah Jaya Mandiri', npwp: '012345678501000', isPkp: true, tipe: TipeCustomer.DISTRIBUTOR, kota: 'Semarang', telp: '024-841-220', terminHari: 30, kreditLimit: '300000000' },
    { kode: 'PLG-002', nama: 'Toko Maju Jaya', npwp: '073456789507000', isPkp: true, tipe: TipeCustomer.RITEL, kota: 'Salatiga', telp: '0298-321-441', terminHari: 14, kreditLimit: '100000000' },
    { kode: 'PLG-003', nama: 'PT Logistik Andal Nusantara', npwp: '023456789502000', isPkp: true, tipe: TipeCustomer.KORPORAT, kota: 'Semarang', telp: '024-700-8800', terminHari: 45, kreditLimit: '500000000' },
    { kode: 'PLG-004', nama: 'UD Sumber Rejeki', npwp: null, isPkp: false, tipe: TipeCustomer.RITEL, kota: 'Solo', telp: '0271-220-118', terminHari: 7, kreditLimit: '25000000' },
    { kode: 'PLG-005', nama: 'Koperasi Tani Sejahtera', npwp: '084567890508000', isPkp: false, tipe: TipeCustomer.KOPERASI, kota: 'Magelang', telp: '0276-330-552', terminHari: 30, kreditLimit: '80000000' },
  ];
  for (const c of data) {
    await prisma.customer.upsert({
      where: { tenantId_kode: { tenantId, kode: c.kode } },
      create: {
        tenantId,
        kode: c.kode,
        nama: c.nama,
        npwp: c.npwp,
        isPkp: c.isPkp,
        tipe: c.tipe,
        kota: c.kota,
        telp: c.telp,
        terminHari: c.terminHari,
        kreditLimit: c.kreditLimit,
        akunPiutangId: akunPiutang ?? null,
      },
      update: { nama: c.nama, terminHari: c.terminHari, kreditLimit: c.kreditLimit },
    });
  }
  return data.length;
}

// ===============================================================
// FiscalYear 2026 + 12 periode bulanan
// ===============================================================

async function seedFiscalYear(tenantId: string) {
  const year = 2026;
  const fy = await prisma.fiscalYear.upsert({
    where: { tenantId_kode: { tenantId, kode: String(year) } },
    create: {
      tenantId,
      kode: String(year),
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      status: FiscalYearStatus.OPEN,
    },
    update: {},
  });

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  for (let m = 1; m <= 12; m++) {
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0)); // hari terakhir bulan
    // Tutup Jan-Apr 2026 supaya bisa demo period close.
    const status: PeriodStatus = m <= 4 ? PeriodStatus.CLOSED : PeriodStatus.OPEN;
    await prisma.fiscalPeriod.upsert({
      where: {
        tenantId_fiscalYearId_no: {
          tenantId,
          fiscalYearId: fy.id,
          no: m,
        },
      },
      create: {
        tenantId,
        fiscalYearId: fy.id,
        no: m,
        label: `${monthNames[m - 1]} ${year}`,
        startDate: start,
        endDate: end,
        status,
        closedAt: status === PeriodStatus.CLOSED ? new Date() : null,
      },
      update: {},
    });
  }
}

// ===============================================================
// Aset Tetap — sesuai Pasal 11 UU PPh
// Default masa manfaat per kelompok:
//   BANGUNAN_PERMANEN       240 bulan (20 tahun)
//   BANGUNAN_NON_PERMANEN   120 bulan (10 tahun)
//   KELOMPOK_I               48 bulan (4 tahun)
//   KELOMPOK_II              96 bulan (8 tahun)
//   KELOMPOK_III            192 bulan (16 tahun)
//   KELOMPOK_IV             240 bulan (20 tahun)
// ===============================================================

const MASA_MANFAAT_BULAN: Record<KelompokAsetTetap, number> = {
  BANGUNAN_PERMANEN: 240,
  BANGUNAN_NON_PERMANEN: 120,
  KELOMPOK_I: 48,
  KELOMPOK_II: 96,
  KELOMPOK_III: 192,
  KELOMPOK_IV: 240,
};

async function seedAsetTetap(
  tenantId: string,
  cabangId: string,
  coa: Map<string, string>,
) {
  const akunBangunan = coa.get('1-202');
  const akumBangunan = coa.get('1-203');
  const akunKendaraan = coa.get('1-204');
  const akumKendaraan = coa.get('1-205');
  const akunPeralatan = coa.get('1-206');
  const akumPeralatan = coa.get('1-207');
  const akunBeban = coa.get('6-103'); // Beban Penyusutan
  if (!akunBangunan || !akumBangunan || !akunKendaraan || !akumKendaraan ||
      !akunPeralatan || !akumPeralatan || !akunBeban) {
    console.log('  ⚠ Akun aset/akumulasi/beban belum lengkap, skip seed aset');
    return 0;
  }

  // PMK ref: bangunan WAJIB GARIS_LURUS; non-bangunan boleh GL atau SALDO_MENURUN.
  const data: Array<{
    kode: string; nama: string; kelompok: KelompokAsetTetap;
    metode: MetodePenyusutan;
    tanggalPerolehan: string; // ISO
    hargaPerolehan: string;
    akunAsetId: string; akunAkumulasiId: string;
    akumulasi: string; // snapshot akumulasi sampai Apr 2026 (sebagai opening balance)
    lastDepresiasiPeriode: string | null;
  }> = [
    {
      kode: 'AT-001', nama: 'Gedung kantor & gudang',
      kelompok: KelompokAsetTetap.BANGUNAN_PERMANEN,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2021-01-15',
      hargaPerolehan: '600000000',
      akunAsetId: akunBangunan, akunAkumulasiId: akumBangunan,
      akumulasi: '130000000', lastDepresiasiPeriode: '2026-04',
    },
    {
      kode: 'AT-002', nama: 'Kendaraan box distribusi',
      kelompok: KelompokAsetTetap.KELOMPOK_II,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2023-03-10',
      hargaPerolehan: '320000000',
      akunAsetId: akunKendaraan, akunAkumulasiId: akumKendaraan,
      akumulasi: '128000000', lastDepresiasiPeriode: '2026-04',
    },
    {
      kode: 'AT-003', nama: 'Forklift & alat gudang',
      kelompok: KelompokAsetTetap.KELOMPOK_I,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2024-07-01',
      hargaPerolehan: '180000000',
      akunAsetId: akunPeralatan, akunAkumulasiId: akumPeralatan,
      akumulasi: '41250000', lastDepresiasiPeriode: '2026-04',
    },
    {
      kode: 'AT-004', nama: 'Komputer & server',
      kelompok: KelompokAsetTetap.KELOMPOK_I,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2025-02-01',
      hargaPerolehan: '90000000',
      akunAsetId: akunPeralatan, akunAkumulasiId: akumPeralatan,
      akumulasi: '16875000', lastDepresiasiPeriode: '2026-04',
    },
    {
      kode: 'AT-005', nama: 'Furnitur kantor',
      kelompok: KelompokAsetTetap.KELOMPOK_I,
      metode: MetodePenyusutan.GARIS_LURUS,
      tanggalPerolehan: '2022-01-15',
      hargaPerolehan: '60000000',
      akunAsetId: akunPeralatan, akunAkumulasiId: akumPeralatan,
      akumulasi: '52500000', lastDepresiasiPeriode: '2026-04',
    },
  ];

  for (const a of data) {
    const masa = MASA_MANFAAT_BULAN[a.kelompok];
    const hp = Number(a.hargaPerolehan);
    const akum = Number(a.akumulasi);
    const nilaiBuku = (hp - akum).toFixed(2);
    const perolehan = new Date(a.tanggalPerolehan + 'T00:00:00Z');
    // Mulai penyusutan: bulan berikutnya setelah perolehan (konservatif).
    const mulai = new Date(Date.UTC(
      perolehan.getUTCFullYear(),
      perolehan.getUTCMonth() + 1,
      1,
    ));
    await prisma.asetTetap.upsert({
      where: { tenantId_kode: { tenantId, kode: a.kode } },
      create: {
        tenantId,
        cabangId,
        kode: a.kode,
        nama: a.nama,
        kelompok: a.kelompok,
        metode: a.metode,
        tanggalPerolehan: perolehan,
        mulaiPenyusutan: mulai,
        hargaPerolehan: a.hargaPerolehan,
        nilaiResidu: '0',
        masaManfaatBulan: masa,
        akumulasiPenyusutan: a.akumulasi,
        nilaiBuku,
        lastDepresiasiPeriode: a.lastDepresiasiPeriode,
        akunAsetId: a.akunAsetId,
        akunAkumulasiId: a.akunAkumulasiId,
        akunBebanId: akunBeban,
        status: AsetStatus.AKTIF,
      },
      update: {
        akumulasiPenyusutan: a.akumulasi,
        nilaiBuku,
        lastDepresiasiPeriode: a.lastDepresiasiPeriode,
      },
    });
  }
  return data.length;
}

// ===============================================================
// Karyawan demo (Fase 7) — 5 karyawan dengan PTKP varied
// ===============================================================

async function seedKaryawan(tenantId: string, cabangId: string) {
  const data: Array<{
    kode: string; nik: string; nama: string; jabatan: string;
    ptkpStatus: PtkpStatus; gajiPokok: string; tunjangan: string;
    bpjs: string; npwp: string | null;
  }> = [
    { kode: 'KAR-001', nik: '3374011501850001', nama: 'Budi Hartono',
      jabatan: 'Direktur Operasional', ptkpStatus: PtkpStatus.K_2,
      gajiPokok: '25000000', tunjangan: '5000000', bpjs: '750000',
      npwp: '274834561503000' },
    { kode: 'KAR-002', nik: '3374022703900002', nama: 'Sri Wahyuni',
      jabatan: 'Manager Keuangan', ptkpStatus: PtkpStatus.K_1,
      gajiPokok: '15000000', tunjangan: '3000000', bpjs: '450000',
      npwp: '385926471604000' },
    { kode: 'KAR-003', nik: '3374030505920003', nama: 'Agus Setiawan',
      jabatan: 'Staf Gudang', ptkpStatus: PtkpStatus.TK_0,
      gajiPokok: '6500000', tunjangan: '1500000', bpjs: '200000',
      npwp: null },
    { kode: 'KAR-004', nik: '3374041112880004', nama: 'Dewi Lestari',
      jabatan: 'Akuntan Senior', ptkpStatus: PtkpStatus.K_0,
      gajiPokok: '12000000', tunjangan: '2500000', bpjs: '362500',
      npwp: '496037582705000' },
    { kode: 'KAR-005', nik: '3374052309950005', nama: 'Rizky Pratama',
      jabatan: 'Staf Penjualan', ptkpStatus: PtkpStatus.TK_1,
      gajiPokok: '7500000', tunjangan: '2000000', bpjs: '237500',
      npwp: null },
  ];
  for (const k of data) {
    await prisma.karyawan.upsert({
      where: { tenantId_kode: { tenantId, kode: k.kode } },
      create: {
        tenantId, cabangId,
        kode: k.kode, nik: k.nik, nama: k.nama,
        jabatan: k.jabatan,
        ptkpStatus: k.ptkpStatus,
        jenisKaryawan: JenisKaryawan.PEGAWAI_TETAP,
        tanggalMasuk: new Date('2024-01-01'),
        gajiPokok: k.gajiPokok,
        tunjanganTetap: k.tunjangan,
        iuranBpjsKaryawan: k.bpjs,
        npwp: k.npwp,
      },
      update: {
        nama: k.nama, jabatan: k.jabatan,
        gajiPokok: k.gajiPokok, tunjanganTetap: k.tunjangan,
        iuranBpjsKaryawan: k.bpjs,
      },
    });
  }
  return data.length;
}

async function main() {
  console.log('🌱 Seeding Lentera...');

  // ---------- Tenant
  let tenant = await prisma.tenant.findFirst({ where: { nama: 'PT Sinar Niaga Sentosa' } });
  tenant ??= await prisma.tenant.create({
    data: {
      nama: 'PT Sinar Niaga Sentosa',
      npwp: '012345678901000',
      isPkp: true,
      pkpNo: 'S-001/PKP/2020',
      alamat: 'Jl. Gajah Mada 14, Semarang',
      email: 'finance@sinarniaga.co.id',
      telp: '024-841-0000',
    },
  });
  console.log(`  ✓ Tenant: ${tenant.nama} (${tenant.id})`);

  // ---------- Cabang
  const pusat = await prisma.cabang.upsert({
    where: { tenantId_kode: { tenantId: tenant.id, kode: 'SMG' } },
    create: {
      tenantId: tenant.id,
      kode: 'SMG',
      nama: 'Cabang Semarang (Pusat)',
      kodeCabangNpwp: '000',
      alamat: 'Jl. Gajah Mada 14, Semarang',
      isPusat: true,
    },
    update: {},
  });
  const sby = await prisma.cabang.upsert({
    where: { tenantId_kode: { tenantId: tenant.id, kode: 'SBY' } },
    create: {
      tenantId: tenant.id,
      kode: 'SBY',
      nama: 'Cabang Surabaya',
      kodeCabangNpwp: '001',
      npwpCabang: '012345678901001',
      alamat: 'Jl. Pemuda 88, Surabaya',
    },
    update: {},
  });
  console.log(`  ✓ Cabang: ${pusat.kode} (pusat), ${sby.kode}`);

  // ---------- COA + tarif pajak
  const coaMap = await seedCoa(tenant.id);
  console.log(`  ✓ COA: ${coaMap.size} akun`);
  await seedTaxRates(tenant.id, coaMap);
  console.log(`  ✓ Tarif pajak`);
  await seedPph23Tarif(tenant.id);
  console.log(`  ✓ Tarif PPh 23 (jenis jasa PMK 141/2015)`);
  await seedIndustri(tenant.id);
  console.log(`  ✓ Master jenis industri`);

  // ---------- Master barang + stok awal di Cabang Pusat
  const nItem = await seedItems(tenant.id, coaMap);
  await seedItemStokAwal(tenant.id, pusat.id, new Date(Date.UTC(2026, 0, 1)));
  console.log(`  ✓ Items: ${nItem} barang (+ stok awal di cabang pusat)`);

  // ---------- Vendor & Customer
  const nVendor = await seedVendors(tenant.id, coaMap);
  const nCustomer = await seedCustomers(tenant.id, coaMap);
  console.log(`  ✓ Vendor: ${nVendor}, Customer: ${nCustomer}`);

  // ---------- Fiscal year 2026
  await seedFiscalYear(tenant.id);
  console.log(`  ✓ FiscalYear 2026 (12 periode, Jan-Apr di-CLOSE untuk demo)`);

  // ---------- Aset tetap (5 aset @ pusat)
  const nAset = await seedAsetTetap(tenant.id, pusat.id, coaMap);
  console.log(`  ✓ Aset tetap: ${nAset} aset (snapshot akumulasi s/d Apr 2026)`);

  // ---------- Karyawan (5 orang dgn PTKP varied)
  const nKaryawan = await seedKaryawan(tenant.id, pusat.id);
  console.log(`  ✓ Karyawan: ${nKaryawan} orang (PTKP TK0/K0/K1/K2/TK1)`);

  // ---------- Users (idempotent password hash)
  const passwordHash = await argon2.hash('lentera123', { type: argon2.argon2id });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@lentera.id' },
    create: { email: 'owner@lentera.id', nama: 'Galih Sidik', passwordHash },
    update: {},
  });
  const akuntan = await prisma.user.upsert({
    where: { email: 'akuntan@lentera.id' },
    create: { email: 'akuntan@lentera.id', nama: 'Rina Anjani', passwordHash },
    update: {},
  });

  // Owner → akses semua cabang (membership tanpa baris di membership_cabang)
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    create: { userId: owner.id, tenantId: tenant.id, role: Role.OWNER },
    update: { role: Role.OWNER },
  });

  // Akuntan → akses cabang Semarang saja
  const akMem = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: akuntan.id, tenantId: tenant.id } },
    create: { userId: akuntan.id, tenantId: tenant.id, role: Role.AKUNTAN },
    update: { role: Role.AKUNTAN },
  });
  await prisma.membershipCabang.upsert({
    where: { membershipId_cabangId: { membershipId: akMem.id, cabangId: pusat.id } },
    create: { membershipId: akMem.id, cabangId: pusat.id },
    update: {},
  });
  console.log(`  ✓ Users: owner@lentera.id (OWNER), akuntan@lentera.id (AKUNTAN)`);
  console.log(`     Password: lentera123`);

  console.log('\n✅ Seed selesai.\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
