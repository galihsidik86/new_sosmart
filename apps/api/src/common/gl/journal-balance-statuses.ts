import { JournalStatus } from '@lentera/db';

/**
 * Status jurnal yang efeknya IKUT DIHITUNG dalam saldo/mutasi akun.
 *
 * REVERSED disertakan SENGAJA — jurnal itu benar-benar terjadi di tanggalnya
 * sebelum dibalik; jurnal pembaliknya (POSTED, tanggal sendiri) yang
 * menetralkan efeknya. Kalau REVERSED dikecualikan, baris jurnal asli gugur
 * dari perhitungan sementara baris jurnal pembalik (sudah tertukar arah)
 * tetap terhitung — saldo jadi SALAH ARAH (kebalikan transaksi asli), bukan
 * balik ke nol seperti seharusnya.
 *
 * DRAFT sengaja dikecualikan — belum pernah efektif, tidak boleh memengaruhi
 * saldo sama sekali.
 *
 * Pakai constant ini di SEMUA query yang menjumlahkan `journalLine.debit`/
 * `kredit` untuk menghitung saldo atau mutasi akun. JANGAN pakai untuk query
 * lifecycle/listing (mis. "jurnal mana yang boleh direverse", "list jurnal
 * dengan filter status pilihan user") — di situ `JournalStatus.POSTED` saja
 * tetap benar.
 */
export const JOURNAL_BALANCE_STATUSES: JournalStatus[] = [JournalStatus.POSTED, JournalStatus.REVERSED];
