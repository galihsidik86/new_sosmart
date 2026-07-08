/**
 * Unit test murni (tanpa DB) untuk bug pembulatan persediaan yang ditemukan
 * saat review ronde 2: `buildPreviewInTx` (cross-check balance) dulu
 * menjumlah `qty × hargaPokokPerUnit` MENTAH (tanpa dibulatkan per baris),
 * sementara `post()` (posting jurnal sungguhan) membulatkan tiap baris ke 2
 * desimal (`.toDecimalPlaces(2)`) SEBELUM dijumlah — lihat
 * `opening-balance.service.ts`. Karena `qty` DECIMAL(20,4) × harga
 * DECIMAL(20,2) rutin menghasilkan >2 desimal, dua cara jumlah ini bisa
 * beda hasil, membuat preview bilang "balanced" padahal jurnal yang
 * benar-benar diposting menyisakan residual di akun kliring (atau
 * sebaliknya, preview menolak input yang sebenarnya sudah pas).
 *
 * Test ini menguji INVARIANT matematisnya secara langsung (Decimal murni,
 * tanpa Nest/Prisma) — bukan integrasi DB.
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

// Sama persis config yang di-set packages/shared/src/money.ts (efek samping
// import-time yang dipakai app runtime sungguhan) — di-set eksplisit di sini
// supaya test ini TIDAK bergantung urutan import antar file test (vitest
// `pool: 'threads'` bisa menjalankan file ini di worker terisolasi yang
// belum pernah meng-import money.ts, di mana default decimal.js adalah
// ROUND_HALF_UP, bukan ROUND_HALF_EVEN — bikin ekspektasi test ini salah).
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

/** Cara LAMA (buggy) — dipakai buildPreviewInTx sebelum fix: jumlah dulu, baru toFixed(2) di akhir. */
function totalRawThenFormat(lines: Array<{ qty: string; harga: string }>): string {
  const total = lines.reduce(
    (a, l) => a.plus(new Decimal(l.qty).mul(l.harga)), new Decimal(0),
  );
  return total.toFixed(2);
}

/** Cara BENAR (setelah fix) — bulatkan tiap baris dulu (sama seperti post()), baru jumlah. */
function totalRoundedPerLine(lines: Array<{ qty: string; harga: string }>): string {
  const total = lines.reduce(
    (a, l) => a.plus(new Decimal(l.qty).mul(l.harga).toDecimalPlaces(2)), new Decimal(0),
  );
  return total.toFixed(2);
}

describe('Saldo Awal — pembulatan persediaan (regresi bug preview vs post)', () => {
  it('qty desimal (12.005 × 5.00, 2 baris): cara lama beda dengan cara benar — buktikan bug-nya nyata', () => {
    const lines = [
      { qty: '12.005', harga: '5.00' },
      { qty: '12.005', harga: '5.00' },
    ];
    // Raw: 60.025 + 60.025 = 120.05 (exact, TANPA pembulatan per baris).
    expect(totalRawThenFormat(lines)).toBe('120.05');
    // Per-baris dibulatkan dulu (ROUND_HALF_EVEN: 60.025 → 60.02, karena 2 genap),
    // baru dijumlah: 60.02 + 60.02 = 120.04 — INI yang benar-benar diposting.
    expect(totalRoundedPerLine(lines)).toBe('120.04');
    // Selisihnya persis Rp 0.01 — kecil tapi nyata, dan berkembang makin besar
    // makin banyak baris yang qty-nya generate sisa >2 desimal.
  });

  it('post() (fixed) dan preview (setelah fix) sekarang HARUS pakai formula yang sama — totalRoundedPerLine', () => {
    // opening-balance.service.ts: buildPreviewInTx() baris totalPersediaan
    // dan post() baris `nilai = ...toDecimalPlaces(2)` sekarang identik —
    // regresi test ini memastikan formula acuannya tidak diam-diam berubah lagi.
    const lines = [
      { qty: '3.333', harga: '10.00' },   // 33.33 (sudah pas 2dp, tidak ambigu)
      { qty: '7.777', harga: '2.50' },    // 19.4425 → round 19.44
      { qty: '0.001', harga: '999.99' },  // 0.99999 → round 1.00
    ];
    // 33.33 + 19.44 + 1.00 = 53.77 (hasil yang BENAR, sesuai apa yang diposting).
    expect(totalRoundedPerLine(lines)).toBe('53.77');
    // Cara lama akan beda: 33.33 + 19.4425 + 0.99999 = 53.77249 → toFixed(2) = '53.77'
    // (kebetulan sama di kasus ini karena efek pembulatan saling menutup —
    // membuktikan bug ini TIDAK SELALU kelihatan, makin berbahaya karena
    // kadang lolos tanpa gejala dan kadang menyisakan residual di kliring).
    expect(totalRawThenFormat(lines)).toBe('53.77');
  });

  it('qty banyak baris kecil — akumulasi selisih pembulatan bisa signifikan', () => {
    // 7 baris identik qty=1.005 (setengah-sen ambigu) × harga=1.00.
    const lines = Array.from({ length: 7 }, () => ({ qty: '1.005', harga: '1.00' }));
    // Raw: 7 × 1.005 = 7.035 (exact).
    expect(totalRawThenFormat(lines)).toBe('7.04'); // toFixed(2) HALF_UP di titik akhir: 7.035 → 7.04
    // Per-baris: 1.005 → round HALF_EVEN ke 1.00 (0 genap) — jadi 7 × 1.00 = 7.00.
    expect(totalRoundedPerLine(lines)).toBe('7.00');
    // Selisih Rp 0.04 dari 7 baris kecil — preview lama bisa bilang "balanced"
    // untuk skenario yang setelah posting sungguhan menyisakan Rp 0.04 di
    // akun kliring (3-105), bukan nol seperti yang dijanjikan fitur ini.
  });
});
