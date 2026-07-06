import { BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import type { Prisma } from '@lentera/db';

/**
 * Resolusi akun pajak PPN yang BENAR sesuai tarif efektif faktur.
 *
 * MASALAH yang diperbaiki: kode posting lama selalu me-lookup tarif dengan
 * kode hardcoded 'PPN-EFEKTIF-11'. Untuk faktur BKP mewah (tarif 12%), PPN
 * keluaran/masukan tersalah-posting ke akun tarif 11% — mis-klasifikasi
 * liabilitas/aset pajak, dan bisa gagal total kalau tenant hanya
 * mengkonfigurasi tarif 12%.
 *
 * Karena faktur TIDAK menyimpan `tarifPpnPersen`, tarif efektif diturunkan
 * dari total faktur itu sendiri (totalPpn / totalDpp). Nilai ini lalu
 * dicocokkan ke baris TaxRate ber-skema PPN yang tarif-nya paling dekat.
 * Ini menghormati konfigurasi per-tenant (mis. akun Utang PPN Mewah
 * terpisah) tanpa perlu migrasi skema.
 */

type TaxAccountField = 'akunUtangId' | 'akunPiutangId';

/** Turunkan tarif efektif (persen) dari total DPP + PPN faktur. */
export function effectivePpnRate(totalDpp: Decimal.Value, totalPpn: Decimal.Value): number {
  const dpp = new Decimal(totalDpp);
  const ppn = new Decimal(totalPpn);
  if (dpp.lte(0) || ppn.lte(0)) return 11; // default aman
  // Bulatkan ke 0.1% untuk menghindari noise pembulatan per-baris.
  return ppn.div(dpp).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * Ambil accountId pajak PPN (utang untuk keluaran / piutang untuk masukan)
 * yang cocok dengan tarif efektif faktur. Melempar BadRequest dengan pesan
 * jelas kalau tidak ada TaxRate PPN yang punya akun ter-set.
 */
export async function resolvePpnAccountId(
  tx: Prisma.TransactionClient,
  field: TaxAccountField,
  totalDpp: Decimal.Value,
  totalPpn: Decimal.Value,
): Promise<string> {
  const rate = effectivePpnRate(totalDpp, totalPpn);

  // Semua tarif PPN aktif milik tenant (RLS sudah membatasi ke tenant aktif).
  const ppnRates = await tx.taxRate.findMany({
    where: { ppnSkema: { not: null }, isAktif: true },
    select: { tarif: true, akunUtangId: true, akunPiutangId: true, kode: true },
  });
  if (ppnRates.length === 0) {
    throw new BadRequestException('Belum ada tarif PPN yang dikonfigurasi');
  }

  // Pilih tarif dengan selisih terkecil terhadap tarif efektif faktur, yang
  // punya akun ter-set di field yang diminta.
  let best: { accountId: string; diff: Decimal } | null = null;
  for (const r of ppnRates) {
    const accountId = r[field];
    if (!accountId) continue;
    const diff = new Decimal(r.tarif).minus(rate).abs();
    if (!best || diff.lt(best.diff)) best = { accountId, diff };
  }

  if (!best) {
    const label = field === 'akunUtangId' ? 'Utang PPN (keluaran)' : 'PPN Masukan';
    throw new BadRequestException(
      `Akun ${label} belum di-set di tarif PPN mana pun — lengkapi di Pengaturan › Tarif Pajak`,
    );
  }
  return best.accountId;
}
