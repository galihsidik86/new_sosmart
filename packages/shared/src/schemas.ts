import { z } from 'zod';
import {
  JenisKaryawan, KelompokAsetTetap, KlasifikasiPpn, MetodePenyusutan,
  PtkpStatus, Role,
} from './enums.js';

/**
 * Regex tanggal `\d{4}-\d{2}-\d{2}` cuma cek FORMAT, bukan validitas kalender
 * — "2026-02-30" lolos, lalu `new Date('2026-02-30T00:00:00Z')` diam-diam
 * rollover jadi 2 Maret 2026. Tanggal yang salah ini lalu dipakai untuk
 * lookup fiscal period (posting jurnal/faktur bisa "lari" ke periode lain
 * tanpa peringatan). Dipakai sebagai `.refine()` tambahan di semua skema
 * tanggal ISO di bawah.
 */
function isValidCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Validator NPWP 15 digit (format DJP terbaru/NIK) atau 16 digit NIK. */
export const npwpSchema = z
  .string()
  .trim()
  .regex(/^(\d{15}|\d{16})$/, 'NPWP harus 15 atau 16 digit (NIK era Coretax).')
  .or(z.literal('').transform(() => null))
  .nullable();

/** Pretty NPWP "XX.XXX.XXX.X-XXX.XXX" → digit only. */
export const npwpFromPretty = (s: string): string => s.replace(/[^0-9]/g, '');

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    nama: z.string(),
  }),
  memberships: z.array(
    z.object({
      tenantId: z.string().uuid(),
      tenantNama: z.string(),
      role: z.nativeEnum(Role),
      cabangIds: z.array(z.string().uuid()),
    })
  ),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string(),
});

export const createCabangInputSchema = z.object({
  kode: z.string().min(1).max(20),
  nama: z.string().min(1).max(200),
  npwpCabang: npwpSchema,
  alamat: z.string().optional(),
  isPusat: z.boolean().default(false),
});
export type CreateCabangInput = z.infer<typeof createCabangInputSchema>;

// ---------- TENANT (Profil Perusahaan) ----------

export const updateTenantInputSchema = z.object({
  nama: z.string().min(2).max(160).optional(),
  npwp: npwpSchema.optional(),
  isPkp: z.boolean().optional(),
  pkpNo: z.string().max(60).optional().or(z.literal('').transform(() => undefined)),
  alamat: z.string().max(500).optional(),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  telp: z.string().max(50).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantInputSchema>;

// ---------- ITEM ----------

/// Validasi nominal sebagai string (DECIMAL-safe) atau number positif.
const moneyStringSchema = z
  .union([
    z.number().nonnegative(),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Format nominal tidak valid'),
  ])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v));

export const createItemInputSchema = z.object({
  kode: z.string().min(1).max(50),
  nama: z.string().min(1).max(200),
  kategori: z.string().max(100).optional(),
  satuan: z.string().min(1).max(20).default('Pcs'),
  hargaJualDefault: moneyStringSchema.default('0'),
  klasifikasiPpn: z.nativeEnum(KlasifikasiPpn).default(KlasifikasiPpn.BKP),
  isJasa: z.boolean().default(false),
  kodeSatuanDjp: z.string().max(10).optional(),
  akunPendapatanId: z.string().uuid().optional().nullable(),
  akunPersediaanId: z.string().uuid().optional().nullable(),
  akunHppId: z.string().uuid().optional().nullable(),
  /// Tarif PPh 23 preset — dipakai kalau isJasa=true.
  pph23TarifId: z.string().uuid().optional().nullable(),
  catatan: z.string().max(500).optional(),
});
export type CreateItemInput = z.infer<typeof createItemInputSchema>;

// ---------- VENDOR ----------

export const createVendorInputSchema = z.object({
  kode: z.string().min(1).max(50),
  nama: z.string().min(1).max(200),
  npwp: npwpSchema,
  isPkp: z.boolean().default(false),
  kategori: z.string().max(100).optional(),
  alamat: z.string().max(500).optional(),
  kota: z.string().max(100).optional(),
  provinsi: z.string().max(100).optional(),
  kodePos: z.string().max(10).optional(),
  telp: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  contactPerson: z.string().max(100).optional(),
  terminHari: z.coerce.number().int().min(0).max(365).default(30),
  catatan: z.string().max(500).optional(),
});
export type CreateVendorInput = z.infer<typeof createVendorInputSchema>;

// ---------- CUSTOMER ----------

export const TipeCustomerEnum = z.enum([
  'DISTRIBUTOR',
  'RITEL',
  'KORPORAT',
  'KOPERASI',
  'PEMERINTAH',
  'LAINNYA',
]);
export type TipeCustomerInput = z.infer<typeof TipeCustomerEnum>;

export const createCustomerInputSchema = z.object({
  kode: z.string().min(1).max(50),
  nama: z.string().min(1).max(200),
  npwp: npwpSchema,
  isPkp: z.boolean().default(false),
  tipe: TipeCustomerEnum.default('RITEL'),
  alamat: z.string().max(500).optional(),
  kota: z.string().max(100).optional(),
  provinsi: z.string().max(100).optional(),
  kodePos: z.string().max(10).optional(),
  telp: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  contactPerson: z.string().max(100).optional(),
  terminHari: z.coerce.number().int().min(0).max(365).default(14),
  kreditLimit: moneyStringSchema.default('0'),
  catatan: z.string().max(500).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

// ---------- PERIODE ----------

export const closePeriodInputSchema = z.object({
  periodId: z.string().uuid(),
  catatan: z.string().max(500).optional(),
});
export type ClosePeriodInput = z.infer<typeof closePeriodInputSchema>;

export const reopenPeriodInputSchema = z.object({
  periodId: z.string().uuid(),
  alasan: z.string().min(5).max(500),
});
export type ReopenPeriodInput = z.infer<typeof reopenPeriodInputSchema>;

export const closeFiscalYearInputSchema = z.object({
  fiscalYearId: z.string().uuid(),
  catatan: z.string().max(500).optional(),
});
export type CloseFiscalYearInput = z.infer<typeof closeFiscalYearInputSchema>;

export const reopenFiscalYearInputSchema = z.object({
  fiscalYearId: z.string().uuid(),
  alasan: z.string().min(5).max(500),
});
export type ReopenFiscalYearInput = z.infer<typeof reopenFiscalYearInputSchema>;

export const createFiscalYearInputSchema = z.object({
  kode: z.string().trim().min(1).max(20),
  /// Wajib tanggal 1 (awal bulan) — 12 periode bulanan otomatis dibuat
  /// berturut-turut dari bulan ini (boleh bulan apa pun, bukan cuma Januari,
  /// supaya tahun buku non-kalender juga bisa dibuat).
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-01$/, 'Tanggal mulai harus tanggal 1 (awal bulan)')
    .refine(isValidCalendarDate, 'Tanggal tidak valid'),
});
export type CreateFiscalYearInput = z.infer<typeof createFiscalYearInputSchema>;

// ---------- JOURNAL ----------

export const journalSourceSchema = z.enum([
  'MANUAL',
  'PENJUALAN',
  'RETUR_JUAL',
  'PEMBELIAN',
  'RETUR_BELI',
  'KAS_BANK',
  'PENYUSUTAN',
  'PENYESUAIAN',
  'TUTUP_BUKU',
  'PAJAK',
  'SALDO_AWAL',
]);
export type JournalSourceInput = z.infer<typeof journalSourceSchema>;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine(isValidCalendarDate, 'Tanggal tidak valid (mis. 30 Februari)');

const lineMoneySchema = z
  .union([
    z.number().nonnegative(),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Format nominal tidak valid'),
  ])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v));

export const journalLineInputSchema = z.object({
  accountId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  debit: lineMoneySchema.default('0'),
  kredit: lineMoneySchema.default('0'),
  deskripsi: z.string().max(500).optional(),
}).refine(
  (l) => Number(l.debit) > 0 !== Number(l.kredit) > 0,
  'Setiap baris harus debit ATAU kredit (XOR), tidak boleh keduanya nol atau keduanya isi.',
);
export type JournalLineInput = z.infer<typeof journalLineInputSchema>;

export const createJournalInputSchema = z.object({
  cabangId: z.string().uuid(),
  tanggal: isoDateSchema,
  deskripsi: z.string().min(1).max(500),
  linkBukti: z.string().url('Link bukti harus URL valid').max(2000).nullable().optional(),
  sumber: journalSourceSchema.default('MANUAL'),
  sumberRef: z.string().optional(),
  lines: z.array(journalLineInputSchema).min(2, 'Minimal 2 baris jurnal'),
}).refine((j) => {
  const d = j.lines.reduce((a, l) => a + Number(l.debit), 0);
  const k = j.lines.reduce((a, l) => a + Number(l.kredit), 0);
  return Math.abs(d - k) < 0.005 && d > 0;
}, 'Total debit harus sama dengan total kredit dan > 0.');
export type CreateJournalInput = z.infer<typeof createJournalInputSchema>;

export const postJournalInputSchema = z.object({
  journalId: z.string().uuid(),
});

export const reverseJournalInputSchema = z.object({
  journalId: z.string().uuid(),
  tanggal: isoDateSchema.optional(),
  alasan: z.string().min(5).max(500),
});
export type ReverseJournalInput = z.infer<typeof reverseJournalInputSchema>;

// ---------- BUKU BESAR / NERACA SALDO ----------

export const ledgerQuerySchema = z.object({
  accountId: z.string().uuid(),
  /// Period buku — kalau null, pakai periode aktif.
  periodId: z.string().uuid().optional(),
  cabangId: z.string().uuid().optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const trialBalanceQuerySchema = z.object({
  periodId: z.string().uuid(),
  cabangId: z.string().uuid().optional(),
  /// Sembunyikan akun dengan mutasi nol & saldo akhir nol.
  hideZero: z.coerce.boolean().default(false),
});
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;

// ---------- ACCOUNT (COA) EDIT ----------

/**
 * Field yang boleh diubah pada akun COA yang sudah ada.
 * Tidak boleh diubah: `kind`, `normalBalance` — keduanya mengubah arti
 * historis di buku besar (sign aplly di LedgerService). Tidak boleh diubah:
 * `id`, `tenantId`. Postable status diizinkan tapi service akan reject kalau
 * akun sudah punya journal_lines (postable=false).
 */
export const updateAccountInputSchema = z.object({
  kode: z.string().min(1).max(20),
  nama: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
  isPostable: z.boolean(),
  isActive: z.boolean(),
  saldoAwal: z.union([z.number(), z.string()]).transform((v) => String(v)),
  catatan: z.string().max(500).nullable().optional(),
  /** Klasifikasi Neraca (lancar/tetap, pendek/panjang). null → laporan fallback prefix. */
  klasifikasiNeraca: z
    .enum(['ASET_LANCAR', 'ASET_TETAP', 'LIABILITAS_PENDEK', 'LIABILITAS_PANJANG'])
    .nullable()
    .optional(),
  /** Kas & setara kas (untuk laporan Arus Kas). */
  isKasSetara: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

// ---------- TRANSAKSI: FAKTUR ----------

const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD')
  .refine(isValidCalendarDate, 'Tanggal tidak valid (mis. 30 Februari)');
// Sebelumnya lineMoney cuma `z.union([number, string]).transform(String)` — tidak
// menolak angka negatif atau string non-numerik ("abc"). Nilai negatif lolos ke
// computeTotals() dan bisa menghasilkan DPP/PPN negatif yang ditolak Postgres
// (CHECK kredit>=0) sebagai 500 mentah, bukan error validasi yang rapi. Samakan
// dengan lineMoneySchema (journal lines) yang sudah benar.
const lineMoney = z
  .union([
    z.number().nonnegative('Nilai tidak boleh negatif'),
    z.string().regex(/^\d+(\.\d+)?$/, 'Format nominal tidak valid'),
  ])
  .transform((v) => String(v));
// diskonPersen > 100 membuat grossAfterDisc (dan DPP turunannya) negatif —
// bug yang sama dengan di atas, khusus untuk field diskon.
const diskonPersenSchema = lineMoney
  .refine((v) => Number(v) <= 100, 'Diskon tidak boleh lebih dari 100%')
  .default('0');

export const terminSchema = z.enum(['TUNAI', 'KREDIT']);
export const kodeFakturPajakSchema = z.enum([
  'K010', 'K020', 'K030', 'K040', 'K050', 'K060', 'K070', 'K080', 'K090',
]);

export const salesLineInputSchema = z.object({
  itemId: z.string().uuid().optional().nullable(),
  /// Override snapshot deskripsi (kalau tidak diisi, ambil dari item.nama).
  deskripsi: z.string().min(1).max(500),
  qty: lineMoney,
  satuan: z.string().min(1).max(20).default('Pcs'),
  hargaSatuan: lineMoney,
  diskonPersen: diskonPersenSchema,
  klasifikasiPpn: z.nativeEnum(KlasifikasiPpn).default(KlasifikasiPpn.BKP),
  isJasa: z.boolean().default(false),
  akunPendapatanId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
});
export type SalesLineInput = z.infer<typeof salesLineInputSchema>;

export const createSalesInvoiceInputSchema = z.object({
  cabangId: z.string().uuid(),
  customerId: z.string().uuid(),
  tanggal: isoDate,
  jatuhTempo: isoDate.optional(), // dihitung dari termin kalau kosong
  termin: terminSchema.default('KREDIT'),
  /// Untuk TUNAI: akun kas/bank. Untuk KREDIT: akun piutang (default dari customer).
  akunArId: z.string().uuid(),
  deskripsi: z.string().max(500).optional(),
  linkBukti: z.string().url('Link bukti harus URL valid').max(2000).nullable().optional(),
  kodeFakturPajak: kodeFakturPajakSchema.optional(),
  nsfp: z.string().regex(/^\d{16}$/, 'NSFP harus 16 digit').optional(),
  /// Tarif PPN efektif (11 utk PMK 131/2024 normal, 12 utk BKP mewah).
  tarifPpnPersen: z.coerce.number().refine((n) => [11, 12].includes(n), 'Tarif PPN harus 11 atau 12').default(11),
  /// Kalau true, hargaSatuan input sudah include PPN. Engine reverse-calc DPP.
  hargaTermasukPajak: z.boolean().default(false),
  lines: z.array(salesLineInputSchema).min(1, 'Minimal 1 baris'),
  /// Opsional — client generate SEKALI per form mount (bukan per submit),
  /// supaya retry jaringan/double-submit tidak bikin faktur dobel.
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateSalesInvoiceInput = z.infer<typeof createSalesInvoiceInputSchema>;

export const purchaseLineInputSchema = z.object({
  itemId: z.string().uuid().optional().nullable(),
  deskripsi: z.string().min(1).max(500),
  qty: lineMoney,
  satuan: z.string().min(1).max(20).default('Pcs'),
  hargaSatuan: lineMoney,
  diskonPersen: diskonPersenSchema,
  klasifikasiPpn: z.nativeEnum(KlasifikasiPpn).default(KlasifikasiPpn.BKP),
  isJasa: z.boolean().default(false),
  /// Akun debit: persediaan (barang resale) atau beban (jasa/non-resale).
  akunDebitId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
});
export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;

export const createPurchaseInvoiceInputSchema = z.object({
  cabangId: z.string().uuid(),
  vendorId: z.string().uuid(),
  tanggal: isoDate,
  jatuhTempo: isoDate.optional(),
  termin: terminSchema.default('KREDIT'),
  akunApId: z.string().uuid(),
  nomorVendor: z.string().max(50).optional(),
  nsfpMasukan: z.string().regex(/^\d{16}$/).optional(),
  deskripsi: z.string().max(500).optional(),
  linkBukti: z.string().url('Link bukti harus URL valid').max(2000).nullable().optional(),
  hargaTermasukPajak: z.boolean().default(false),
  tarifPpnPersen: z.coerce.number().refine((n) => [11, 12].includes(n)).default(11),
  /// Tarif PPh 23 (2% jasa, 15% royalti/dividen/bunga).
  tarifPph23Persen: z.coerce.number().refine((n) => [0, 2, 15].includes(n)).default(2),
  /// Apakah memotong PPh 23 (hanya berlaku kalau ada baris jasa).
  potongPph23: z.boolean().default(true),
  lines: z.array(purchaseLineInputSchema).min(1),
  /// Opsional — sama seperti CreateSalesInvoiceInput.idempotencyKey.
  idempotencyKey: z.string().uuid().optional(),
});
export type CreatePurchaseInvoiceInput = z.infer<typeof createPurchaseInvoiceInputSchema>;

// ---------- TRANSAKSI: KAS / BANK ----------

export const cashBankTypeSchema = z.enum(['RECEIPT', 'PAYMENT', 'TRANSFER']);

export const cashBankLineInputSchema = z.object({
  accountId: z.string().uuid(),
  nilai: lineMoney,
  deskripsi: z.string().max(500).optional(),
  projectId: z.string().uuid().nullable().optional(),
});
export type CashBankLineInput = z.infer<typeof cashBankLineInputSchema>;

export const createCashBankInputSchema = z.object({
  cabangId: z.string().uuid(),
  tipe: cashBankTypeSchema,
  tanggal: isoDate,
  akunKasBankId: z.string().uuid(),
  /// Untuk TRANSFER, akun lawan (kas/bank yang lain).
  akunKasBankLawanId: z.string().uuid().optional(),
  total: lineMoney,
  kontak: z.string().max(200).optional(),
  deskripsi: z.string().max(500).optional(),
  linkBukti: z.string().url('Link bukti harus URL valid').max(2000).nullable().optional(),
  /// Lines wajib untuk RECEIPT/PAYMENT; kosong untuk TRANSFER.
  lines: z.array(cashBankLineInputSchema).default([]),
  /// Optional: link pelunasan ke faktur.
  salesInvoiceId: z.string().uuid().optional(),
  purchaseInvoiceId: z.string().uuid().optional(),
  /// PPh 23 dipotong pelanggan saat pelunasan piutang JKP (hanya RECEIPT).
  /// Kas masuk = total − pph23Dipotong; sisanya ke PPh 23 Dibayar Dimuka.
  pph23Dipotong: lineMoney.optional(),
  /// Nomor bukti potong PPh 23 dari pelanggan (arsip).
  noBuktiPotong: z.string().max(100).optional(),
}).refine(
  (v) => v.tipe === 'TRANSFER' ? !!v.akunKasBankLawanId : v.lines.length > 0,
  'TRANSFER butuh akunKasBankLawanId; RECEIPT/PAYMENT butuh ≥1 baris.',
).refine(
  (v) => {
    const pph = Number(v.pph23Dipotong ?? 0);
    if (pph <= 0) return true;
    return v.tipe === 'RECEIPT' && pph < Number(v.total);
  },
  'PPh 23 dipotong hanya untuk penerimaan (RECEIPT) dan harus lebih kecil dari total.',
);
export type CreateCashBankInput = z.infer<typeof createCashBankInputSchema>;

// ---------- CANCEL/REVERSE ----------

export const cancelInvoiceInputSchema = z.object({
  alasan: z.string().min(5).max(500),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceInputSchema>;

// ---------- INVENTORY (Fase 5) ----------

const isoDateStrict = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, 'Tanggal tidak valid (mis. 30 Februari)');

export const stokAdjustmentLineInputSchema = z.object({
  itemId: z.string().uuid(),
  qtyFisik: z.union([z.number().nonnegative(), z.string()]).transform((v) => String(v)),
  keterangan: z.string().max(500).optional(),
});
export type StokAdjustmentLineInput = z.infer<typeof stokAdjustmentLineInputSchema>;

export const createStokAdjustmentInputSchema = z.object({
  cabangId: z.string().uuid(),
  tanggal: isoDateStrict,
  alasan: z.string().min(3).max(500),
  lines: z.array(stokAdjustmentLineInputSchema).min(1),
});
export type CreateStokAdjustmentInput = z.infer<typeof createStokAdjustmentInputSchema>;

export const kartuStokQuerySchema = z.object({
  itemId: z.string().uuid(),
  cabangId: z.string().uuid().optional(),
  startDate: isoDateStrict.optional(),
  endDate: isoDateStrict.optional(),
});
export type KartuStokQuery = z.infer<typeof kartuStokQuerySchema>;

// ---------- ASET TETAP (Fase 6) ----------

export const createAsetInputSchema = z.object({
  cabangId: z.string().uuid(),
  kode: z.string().min(1).max(50),
  nama: z.string().min(1).max(200),
  kelompok: z.nativeEnum(KelompokAsetTetap),
  metode: z.nativeEnum(MetodePenyusutan).default(MetodePenyusutan.GARIS_LURUS),
  tanggalPerolehan: isoDateStrict,
  mulaiPenyusutan: isoDateStrict.optional(), // default: bulan setelah perolehan
  hargaPerolehan: z.union([z.number().positive(), z.string()]).transform((v) => String(v)),
  nilaiResidu: z.union([z.number().nonnegative(), z.string()]).transform((v) => String(v)).default('0'),
  /// Override masaManfaat (default dari kelompok). Bulan.
  masaManfaatBulan: z.coerce.number().int().positive().optional(),
  /// Snapshot awal akumulasi (untuk onboarding aset existing).
  akumulasiPenyusutan: z.union([z.number().nonnegative(), z.string()]).transform((v) => String(v)).default('0'),
  lastDepresiasiPeriode: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  akunAsetId: z.string().uuid(),
  akunAkumulasiId: z.string().uuid(),
  akunBebanId: z.string().uuid(),
  catatan: z.string().max(500).optional(),
}).refine(
  (v) => {
    // Bangunan WAJIB garis lurus (UU PPh).
    if (
      (v.kelompok === KelompokAsetTetap.BANGUNAN_PERMANEN ||
        v.kelompok === KelompokAsetTetap.BANGUNAN_NON_PERMANEN) &&
      v.metode !== MetodePenyusutan.GARIS_LURUS
    ) {
      return false;
    }
    return true;
  },
  'Aset kelompok bangunan WAJIB metode penyusutan garis lurus (UU PPh).',
);
export type CreateAsetInput = z.infer<typeof createAsetInputSchema>;

export const disposeAsetInputSchema = z.object({
  tanggalDihentikan: isoDateStrict,
  hargaJual: z.union([z.number().nonnegative(), z.string()]).transform((v) => String(v)).default('0'),
  /// Akun kas/bank tempat hasil penjualan masuk (kalau dijual). Optional kalau RUSAK/PENSIUN.
  akunKasBankId: z.string().uuid().optional(),
  statusBaru: z.enum(['DIJUAL', 'RUSAK', 'PENSIUN']),
  catatan: z.string().max(500).optional(),
});
export type DisposeAsetInput = z.infer<typeof disposeAsetInputSchema>;

export const createDepresiasiRunInputSchema = z.object({
  /// "YYYY-MM"
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'Format periode YYYY-MM'),
  /// Tanggal posting (default: akhir bulan periode).
  tanggal: isoDateStrict.optional(),
});
export type CreateDepresiasiRunInput = z.infer<typeof createDepresiasiRunInputSchema>;

// ---------- PAJAK (Fase 7) ----------

const moneyDecimal = z
  .union([z.number().nonnegative(), z.string()])
  .transform((v) => String(v));

export const createKaryawanInputSchema = z.object({
  cabangId: z.string().uuid().optional().nullable(),
  kode: z.string().min(1).max(50),
  nip: z.string().max(50).optional(),
  nik: z.string().regex(/^\d{16}$/, 'NIK harus 16 digit'),
  nama: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  telp: z.string().max(50).optional(),
  alamat: z.string().max(500).optional(),
  npwp: npwpSchema,
  ptkpStatus: z.nativeEnum(PtkpStatus),
  jenisKaryawan: z.nativeEnum(JenisKaryawan).default(JenisKaryawan.PEGAWAI_TETAP),
  jabatan: z.string().max(100).optional(),
  tanggalMasuk: isoDateStrict,
  tanggalKeluar: isoDateStrict.optional(),
  gajiPokok: moneyDecimal,
  tunjanganTetap: moneyDecimal.default('0'),
  iuranBpjsKaryawan: moneyDecimal.default('0'),
  catatan: z.string().max(500).optional(),
});
export type CreateKaryawanInput = z.infer<typeof createKaryawanInputSchema>;

export const createPayrollRunInputSchema = z.object({
  cabangId: z.string().uuid(),
  /// "YYYY-MM"
  periode: z.string().regex(/^\d{4}-\d{2}$/),
  /// Tanggal posting (default akhir bulan).
  tanggal: isoDateStrict.optional(),
  akunKasBankId: z.string().uuid(),
  /// Override gaji/tunjangan per karyawan untuk run ini (opsional).
  /// Kalau tidak diisi → pakai default karyawan.
  overrides: z.array(z.object({
    karyawanId: z.string().uuid(),
    gajiPokok: moneyDecimal.optional(),
    tunjangan: moneyDecimal.optional(),
    iuranBpjs: moneyDecimal.optional(),
    potonganLain: moneyDecimal.default('0'),
    catatan: z.string().max(500).optional(),
  })).default([]),
  /// Pilih karyawan tertentu saja. Kalau kosong → semua karyawan aktif.
  karyawanIds: z.array(z.string().uuid()).optional(),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunInputSchema>;

// ---------- BUKTI POTONG ----------

export const createBuktiPotongManualInputSchema = z.object({
  cabangId: z.string().uuid(),
  jenisPph: z.enum(['PPH_21', 'PPH_22', 'PPH_23', 'PPH_25', 'PPH_26', 'PPH_29', 'PPH_4_AYAT_2', 'PPH_15']),
  tanggal: isoDateStrict,
  pihakNama: z.string().min(1).max(200),
  pihakNpwp: npwpSchema,
  pihakNik: z.string().regex(/^\d{16}$/).optional(),
  pihakAlamat: z.string().max(500).optional(),
  dpp: moneyDecimal,
  tarifPersen: z.coerce.number().min(0).max(100),
  pph: moneyDecimal,
  catatan: z.string().max(500).optional(),
});
export type CreateBuktiPotongManualInput = z.infer<typeof createBuktiPotongManualInputSchema>;

// ---------- SALDO AWAL TERINTEGRASI ----------

export const saldoAwalAkunLineInputSchema = z.object({
  accountId: z.string().uuid(),
  /// Magnitude, tanda ikut normalBalance akun (konvensi sama Account.saldoAwal).
  nilai: lineMoney,
});
export type SaldoAwalAkunLineInput = z.infer<typeof saldoAwalAkunLineInputSchema>;

export const setSaldoAwalAkunInputSchema = z.object({
  lines: z.array(saldoAwalAkunLineInputSchema),
});
export type SetSaldoAwalAkunInput = z.infer<typeof setSaldoAwalAkunInputSchema>;

export const saldoAwalPiutangInputSchema = z.object({
  customerId: z.string().uuid(),
  cabangId: z.string().uuid(),
  tanggal: isoDateStrict,
  jatuhTempo: isoDateStrict.optional(),
  nominal: lineMoney,
  keterangan: z.string().max(500).optional(),
});
export type SaldoAwalPiutangInput = z.infer<typeof saldoAwalPiutangInputSchema>;

export const saldoAwalUtangInputSchema = z.object({
  vendorId: z.string().uuid(),
  cabangId: z.string().uuid(),
  tanggal: isoDateStrict,
  jatuhTempo: isoDateStrict.optional(),
  nominal: lineMoney,
  keterangan: z.string().max(500).optional(),
});
export type SaldoAwalUtangInput = z.infer<typeof saldoAwalUtangInputSchema>;

export const saldoAwalPersediaanLineInputSchema = z.object({
  itemId: z.string().uuid(),
  cabangId: z.string().uuid(),
  tanggal: isoDateStrict,
  qty: lineMoney,
  hargaPokokPerUnit: lineMoney,
});
export type SaldoAwalPersediaanLineInput = z.infer<typeof saldoAwalPersediaanLineInputSchema>;

export const setSaldoAwalPersediaanInputSchema = z.object({
  lines: z.array(saldoAwalPersediaanLineInputSchema),
});
export type SetSaldoAwalPersediaanInput = z.infer<typeof setSaldoAwalPersediaanInputSchema>;
