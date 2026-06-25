/**
 * Enum domain — di-share antara API, web, dan Prisma.
 * Nilai string sengaja sama persis dengan enum Prisma supaya bisa interop.
 */

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  AKUNTAN: 'AKUNTAN',
  KASIR: 'KASIR',
  AUDITOR: 'AUDITOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Hierarki COA Indonesia. */
export const AccountKind = {
  ASET: 'ASET',
  LIABILITAS: 'LIABILITAS',
  EKUITAS: 'EKUITAS',
  PENDAPATAN: 'PENDAPATAN',
  BEBAN_POKOK: 'BEBAN_POKOK',
  BEBAN: 'BEBAN',
  PENDAPATAN_LAIN: 'PENDAPATAN_LAIN',
  BEBAN_LAIN: 'BEBAN_LAIN',
} as const;
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

/** Saldo normal akun (debit/kredit). */
export const NormalBalance = {
  DEBIT: 'DEBIT',
  KREDIT: 'KREDIT',
} as const;
export type NormalBalance = (typeof NormalBalance)[keyof typeof NormalBalance];

/** Skema PPN sesuai PMK 131/2024. */
export const PpnSkemaEnum = {
  EFEKTIF_11: 'EFEKTIF_11', // DPP nilai lain 11/12 × 12% = 11% efektif
  EFEKTIF_12: 'EFEKTIF_12', // BKP mewah, DPP penuh × 12%
  KHUSUS: 'KHUSUS',
  BEBAS: 'BEBAS',
  TIDAK_DIPUNGUT: 'TIDAK_DIPUNGUT',
} as const;
export type PpnSkemaEnum = (typeof PpnSkemaEnum)[keyof typeof PpnSkemaEnum];

/** Jenis pajak penghasilan untuk e-Bupot Unifikasi. */
export const JenisPph = {
  PPH_21: 'PPH_21',
  PPH_22: 'PPH_22',
  PPH_23: 'PPH_23',
  PPH_25: 'PPH_25',
  PPH_26: 'PPH_26',
  PPH_29: 'PPH_29',
  PPH_4_AYAT_2: 'PPH_4_AYAT_2',
  PPH_15: 'PPH_15',
} as const;
export type JenisPph = (typeof JenisPph)[keyof typeof JenisPph];

/** Kelompok aset tetap menurut Pasal 11 UU PPh. */
export const KelompokAsetTetap = {
  BANGUNAN_PERMANEN: 'BANGUNAN_PERMANEN', // 20 tahun
  BANGUNAN_NON_PERMANEN: 'BANGUNAN_NON_PERMANEN', // 10 tahun
  KELOMPOK_I: 'KELOMPOK_I', // 4 tahun (bukan bangunan)
  KELOMPOK_II: 'KELOMPOK_II', // 8 tahun
  KELOMPOK_III: 'KELOMPOK_III', // 16 tahun
  KELOMPOK_IV: 'KELOMPOK_IV', // 20 tahun
} as const;
export type KelompokAsetTetap = (typeof KelompokAsetTetap)[keyof typeof KelompokAsetTetap];

/** Klasifikasi PPN per item (PMK 131/2024). */
export const KlasifikasiPpn = {
  BKP: 'BKP',
  JKP: 'JKP',
  NON_BKP: 'NON_BKP',
  BKP_STRATEGIS: 'BKP_STRATEGIS',
  BEBAS_PPN: 'BEBAS_PPN',
} as const;
export type KlasifikasiPpn = (typeof KlasifikasiPpn)[keyof typeof KlasifikasiPpn];

/** Status PTKP (Penghasilan Tidak Kena Pajak). */
export const PtkpStatus = {
  TK_0: 'TK_0', TK_1: 'TK_1', TK_2: 'TK_2', TK_3: 'TK_3',
  K_0: 'K_0', K_1: 'K_1', K_2: 'K_2', K_3: 'K_3',
  HB_0: 'HB_0', HB_1: 'HB_1', HB_2: 'HB_2', HB_3: 'HB_3',
} as const;
export type PtkpStatus = (typeof PtkpStatus)[keyof typeof PtkpStatus];

/** Kategori TER PMK 168/2023. */
export const PtkpKategori = {
  A: 'A', B: 'B', C: 'C',
} as const;
export type PtkpKategori = (typeof PtkpKategori)[keyof typeof PtkpKategori];

/** Jenis karyawan. */
export const JenisKaryawan = {
  PEGAWAI_TETAP: 'PEGAWAI_TETAP',
  PEGAWAI_TIDAK_TETAP: 'PEGAWAI_TIDAK_TETAP',
  BUKAN_PEGAWAI: 'BUKAN_PEGAWAI',
  PENERIMA_PENSIUN: 'PENERIMA_PENSIUN',
} as const;
export type JenisKaryawan = (typeof JenisKaryawan)[keyof typeof JenisKaryawan];

/** Status bukti potong. */
export const BuktiPotongStatus = {
  DRAFT: 'DRAFT',
  TERBIT: 'TERBIT',
  DIKIRIM_DJP: 'DIKIRIM_DJP',
  DIBATALKAN: 'DIBATALKAN',
} as const;
export type BuktiPotongStatus = (typeof BuktiPotongStatus)[keyof typeof BuktiPotongStatus];

/** Mapping PTKP status → kategori TER. */
export const PTKP_TO_KATEGORI: Record<PtkpStatus, PtkpKategori> = {
  TK_0: 'A',
  TK_1: 'B', K_0: 'B', TK_2: 'B',
  TK_3: 'C', K_1: 'C', K_2: 'C', K_3: 'C',
  HB_0: 'C', HB_1: 'C', HB_2: 'C', HB_3: 'C',
};

/** Metode penyusutan. */
export const MetodePenyusutan = {
  GARIS_LURUS: 'GARIS_LURUS',
  SALDO_MENURUN: 'SALDO_MENURUN',
} as const;
export type MetodePenyusutan = (typeof MetodePenyusutan)[keyof typeof MetodePenyusutan];
