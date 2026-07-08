# Evaluasi & Perbaikan Menyeluruh — Lentera Accounting

> **Update 8 Juli 2026**: seluruh temuan di "Rekomendasi Lanjutan" (R1–R8) sudah
> ditindaklanjuti — 7 diperbaiki, 1 (R4) sengaja di-skip atas pilihan user.
> Detail lengkap tiap fix ada di `EVALUASI-RONDE2.md` (bagian "Ronde 4"). Ronde
> 2 & 3 (audit kode baru + bug lama lain di luar daftar R1–R8) juga sudah
> selesai — lihat file yang sama.

Tanggal audit: 6 Juli 2026 · Repo: `new_sosmart` (branch `main`)
Lingkup: `apps/api` (NestJS + Prisma + Postgres/RLS), `apps/web` (Next.js), `apps/pos-mobile` (Expo/React Native), `packages/shared`, `packages/db`.

## Ringkasan

Sistem ini adalah akuntansi double-entry multi-tenant multi-cabang yang terhubung ke POS Android (offline-first, sinkron via antrian lokal). Fondasinya kuat dan beberapa keputusan desain patut dicontoh — lihat "Yang sudah benar" di bawah. Audit ini menemukan **1 bug kritis berdampak luas** (celah otorisasi lintas-cabang yang menembus 7 modul transaksi), **1 celah audit kepatuhan** (payroll bisa posting ke periode tertutup), beberapa **bug integritas data/uang** (overpayment tidak divalidasi, validasi input longgar, duplikasi transaksi dari POS offline), dan **1 celah keamanan** (tidak ada rate-limit login). Semua sudah diperbaiki langsung di kode, diverifikasi dengan test sungguhan (bukan hanya baca kode), dan ditambahkan test regresi baru.

**Hasil test:**

| | Sebelum audit ini | Sesudah |
|---|---|---|
| `pnpm typecheck` (5 paket) | bersih | bersih |
| `pnpm test` (unit) | 44 lulus | **59 lulus** (+15 baru) |
| `pnpm test:int` (integrasi, Postgres asli) | 30 lulus | **42 lulus** (+12 baru) |

Perintah yang dipakai untuk verifikasi (semua dijalankan sungguhan, bukan simulasi):
```bash
pnpm db:generate
pnpm typecheck
pnpm test
pnpm test:int          # butuh: pnpm docker:up, DB lentera_test sudah di-migrate + rls.sql
```
Postgres 16 + Redis sudah jalan via `docker-compose` di lingkungan audit ini (container `lentera_postgres`/`lentera_redis`); tidak ada langkah yang di-skip karena "tidak bisa jalan".

## Yang sudah benar (tidak diubah)

- **Uang**: `Decimal.js` konsisten, `DECIMAL(20,2)` di DB, tidak ada float di jalur uang.
- **GL invariant** dipaksa di 3 layer (Zod + service + Postgres CHECK/trigger DEFERRED) — bug aplikasi tidak bisa menghasilkan ledger yang tidak balance.
- **RLS** via GUC session (`SET LOCAL app.tenant_id`), non-superuser runtime.
- **Penomoran dokumen** (`SequenceService`) sudah benar pakai `SELECT ... FOR UPDATE` — tidak ada jalur yang bypass.
- **FIFO inventory** pakai `pg_advisory_xact_lock` per (tenant, item, cabang), lock diambil sebelum read (read-modify-write atomic).
- **Reversal jurnal** menukar D/K dengan benar, mengunci double-reversal, menghormati periode tertutup di tanggal pembalik.
- **Unique constraint DB** (`DepresiasiRun`, `PayrollRun`) menutup race double-submit di level database, bukan hanya application check.
- **Token client**: web pakai cookie `httpOnly`, pos-mobile pakai `expo-secure-store` (Keystore/Keychain) — bukan plaintext.
- **JWT**: payload minimal (`sub`, `email`), TTL wajar, guard global sudah benar (grep `@Public()` cuma di 4 endpoint yang memang harus publik).
- Perbaikan sesi audit sebelumnya (JWT secret hardcoded, refresh-token reuse detection, PPN 12% salah akun) — diverifikasi masih berlaku, tidak dilaporkan ulang.

## Temuan Kritis

### 1. Celah otorisasi lintas-cabang (IDOR) di 7 modul transaksi — **paling parah**

**Masalah.** `CabangScopeService.assertAccess()` dirancang supaya user dengan `MembershipCabang` terbatas (misal AKUNTAN cabang SMG) tidak bisa menyentuh data cabang lain dalam tenant yang sama. Tapi pemanggilannya hanya ada di jalur **baca** (`byId`, `list`) dan **create** — jalur **mutasi** (`updateDraft`, `post`, `cancel`, `deleteDraft`, `reverse`, `dispose`) tidak pernah memanggilnya. RLS hanya mengecek `tenant_id`, jadi query tetap lolos — cabang tidak pernah dicek sama sekali di method-method ini.

**Dampak nyata.** User AKUNTAN yang di-restrict ke cabang SMG, kalau tahu/menebak UUID dokumen cabang JKT (dari notifikasi, log, atau enumerasi), bisa **edit, posting jurnal (termasuk auto-post GL & stok), batalkan, atau hapus** faktur/jurnal/kas-bank/opname-stok/aset/payroll/bukti-potong milik cabang lain. Ini bukan cuma kebocoran baca — ini privilege-escalation-lintas-cabang yang merusak integritas laporan keuangan cabang lain.

**File & fix** (tambah `this.cabangScope.assertAccess(...)` tepat setelah fetch, sebelum cek status — konsisten dengan pola yang sudah ada di `byId`/`createDraft`):
- `apps/api/src/modules/sales/sales.service.ts:254,255,360,568,613` — `updateDraft`, `post`, `cancel`, `deleteDraft`.
- `apps/api/src/modules/purchases/purchases.service.ts:238,239,335,481,513` — sama.
- `apps/api/src/modules/cashbank/cashbank.service.ts:184,185,249,365` — sama.
- `apps/api/src/modules/adjustments/adjustments.service.ts:216,217,291,414,446` — sama.
- `apps/api/src/modules/journals/journals.service.ts:243,303,380,381,441` — `postInTx`, `reverseInTx`, `updateDraft`, `deleteDraftInTx` (aman dipanggil dari service lain karena `cabangId` jurnal selalu sama dengan dokumen sumber yang sudah dicek sendiri).
- `apps/api/src/modules/payroll/payroll.service.ts:303,423,456` — `post`, `cancel`, `deleteDraft` (modul ini **tidak disebut** di draf temuan awal — ditemukan lewat sweep sistematis lanjutan, pola identik).
- `apps/api/src/modules/aset/aset.service.ts:187,307` — `dispose`, `undispose` (juga ditemukan lewat sweep lanjutan).
- `apps/api/src/modules/bukti-potong/bukti-potong.service.ts` — modul ini **tidak pernah** di-cabang-scope sama sekali (bukan cuma mutasi — `list()` dan `byId()` juga bocor lintas cabang). Ditambahkan `CabangScopeService` ke constructor, filter di `list()` (baris 57), `assertAccess` di `byId` (78), `createManual` (143), `cancel` (186).

**Verifikasi nyata**, bukan cuma baca kode: test baru `apps/api/test/cabang-scope.spec.ts` membuat tenant dengan 2 cabang, bikin dokumen DRAFT di cabang B, lalu coba mutasi pakai user yang di-restrict ke cabang A — **9 test, semua gagal sebelum fix (lolos tanpa error) dan lulus sesudah fix** (menangkap `ForbiddenException`). Cakupan test: SalesService (updateDraft/post/cancel/deleteDraft) dan JournalsService (post/updateDraft/deleteDraft/reverse). Purchases/cashbank/adjustments/payroll/aset/bukti-potong diperbaiki dengan **pola kode identik** (diverifikasi manual + typecheck), tapi belum punya test regresi khusus masing-masing — lihat rekomendasi.

### 2. Payroll `post()` tidak re-check periode tertutup

**Masalah.** CLAUDE.md eksplisit: "`PeriodsService.assertOpen` wajib dipanggil oleh semua handler posting transaksi... Lupa = celah audit serius." Semua modul lain (sales, purchases, cashbank, adjustments) re-check status periode tepat sebelum posting jurnal. `PayrollService.post()` tidak — draft payroll yang dibuat saat periode masih OPEN tetap bisa di-post walau periode sudah ditutup di antaranya.

**Dampak.** Jurnal gaji lolos ke periode yang seharusnya sudah "dikunci" — melanggar invariant inti sistem, closing bulanan jadi tidak bisa diandalkan.

**Fix.** `apps/api/src/modules/payroll/payroll.service.ts:311-317` — tambah query `fiscalPeriod` + cek `status === CLOSED` → `ForbiddenException`, pola yang sama dengan `adjustments.service.ts`/`cashbank.service.ts`.

## Temuan Keamanan

### 3. Tidak ada rate-limit / lockout di `/auth/login`

**Masalah.** Endpoint login (`@Public()`) tidak punya pembatasan percobaan sama sekali — tidak ada `@nestjs/throttler`, tidak ada kolom `failedLoginAttempts`/`lockedUntil` di schema. Brute-force / credential-stuffing bisa dicoba tanpa hambatan (argon2 cost tinggi membantu sedikit, tapi tidak menutup serangan skala besar).

**Fix.** `apps/api/src/modules/auth/login-throttle.service.ts` (baru) — limiter in-memory per-email: 5 percobaan gagal dalam 15 menit → lockout 15 menit, reset otomatis setelah login sukses. Diwire ke `AuthService.login()` (`auth.service.ts`) dan didaftarkan di `auth.module.ts`.

**Keterbatasan yang disengaja**: state in-memory per-proses, cukup untuk deployment single-instance saat ini. Kalau API di-scale horizontal, state ini harus dipindah ke Redis (sudah ada di `docker-compose.yml`) supaya limiter konsisten lintas instance — dicatat sebagai komentar di kode.

**Verifikasi.** Unit test baru `apps/api/src/modules/auth/__tests__/login-throttle.test.ts` (6 test, fake timer) — cek lockout setelah 5 gagal, auto-unlock setelah window, reset setelah sukses, isolasi per-email, case-insensitive email.

## Temuan Integritas Data & Uang

### 4. Overpayment tidak divalidasi + race condition lost-update di pelunasan (cashbank)

**Masalah.** `applySalesPayment`/`applyPurchasePayment` (`cashbank.service.ts`) menghitung `totalDibayar` baru dan menurunkan status (POSTED→PARTIAL→PAID) **tanpa pernah menolak** kalau `dibayar > totalNetto` — kasir bisa input BKM lebih besar dari sisa piutang, sistem diam-diam menandai PAID walau lebih bayar, tanpa jejak akun kelebihan-bayar mana pun. Ditambah: read-then-write pada kolom `totalDibayar` **tanpa row lock** — dua BKM untuk faktur yang sama yang diproses bersamaan bisa saling timpa (lost update), salah satu pembayaran "hilang" dari akumulasi walau jurnal GL-nya tetap ter-posting.

**Fix** (`cashbank.service.ts:397-445`): ganti `findUnique` dengan `SELECT ... FOR UPDATE` (raw query, pola sama dengan `SequenceService`) supaya baca-ubah-tulis atomic, lalu tambah validasi `if (dibayar.gt(netto)) throw BadRequestException(...)` dengan pesan yang menyebutkan sisa tagihan.

**Verifikasi.** Test baru `apps/api/test/cashbank-payment.spec.ts` (3 test, pakai faktur POSTED sungguhan): bayar pas sisa → PAID; bayar lebih dari sisa → `BadRequestException`, invoice tidak berubah (rollback penuh); 2 pembayaran parsial berturutan → PARTIAL lalu PAID dengan akumulasi yang benar (membuktikan tidak ada lost-update untuk kasus sequential; race condition konkuren tidak bisa ditest tanpa harness concurrency khusus, tapi lock-nya sudah benar secara kode).

### 5. Validasi input faktur (sales/purchase) longgar — bisa menghasilkan DPP/PPN negatif

**Masalah.** `lineMoney` (skema Zod untuk `qty`/`hargaSatuan`/`diskonPersen` di faktur penjualan & pembelian) hanya `z.union([z.number(), z.string()]).transform(String)` — **tidak menolak angka negatif atau string non-numerik** ("abc" pun lolos). Beda dengan `lineMoneySchema` (jurnal manual) yang sudah benar (`nonnegative()` + regex). Selain itu `diskonPersen` tidak punya batas atas — diskon > 100% membuat `grossAfterDisc` (dan DPP turunannya) **negatif**, yang baru ketahuan saat Postgres menolak INSERT (`CHECK kredit >= 0`) sebagai error 500 mentah, bukan error validasi yang rapi.

**Fix** (`packages/shared/src/schemas.ts`): samakan `lineMoney` dengan `lineMoneySchema` (nonnegative + regex numerik), tambah `diskonPersenSchema` dengan `.refine(v => Number(v) <= 100)`.

**Verifikasi.** Test baru `packages/shared/src/__tests__/schemas.test.ts` (9 test) — qty/hargaSatuan negatif ditolak, qty non-numerik ditolak, diskon > 100% ditolak, diskon = 100% (batas) diterima.

### 6. Validasi tanggal tidak cek validitas kalender — silent date rollover

**Masalah.** Tiga skema tanggal terpisah (`isoDate`, `isoDateSchema`, `isoDateStrict` di `schemas.ts`) semua cuma regex `/^\d{4}-\d{2}-\d{2}$/` — cek format, bukan validitas kalender. `"2026-02-30"` lolos validasi, lalu `new Date('2026-02-30T00:00:00Z')` **diam-diam** jadi 2 Maret 2026 (JS Date rollover). Tanggal salah ini dipakai untuk lookup `fiscalPeriod` di hampir semua modul (jurnal, sales, purchases, aset, payroll, adjustments, cashbank) — jurnal/faktur bisa "lari" ke periode lain tanpa peringatan apa pun.

**Fix**: helper `isValidCalendarDate()` (round-trip lewat `Date.UTC` lalu bandingkan Y/M/D) ditambahkan sebagai `.refine()` ke ketiga skema tanggal.

### 7. POS mobile (offline sync queue) bisa duplikasi transaksi

**Masalah** (`apps/pos-mobile/lib/queue.ts`). Dua bug idempotensi terpisah pada `syncOnce()`:
1. Kondisi bikin draft baru adalah `row.status === 'pending' || 'failed'` — **tidak cek apakah `server_id` sudah ada**. Kalau draft sudah berhasil dibuat tapi request `/post` berikutnya gagal (network drop), baris ditandai `'failed'` dengan `server_id` tetap tersimpan. Retry berikutnya, karena statusnya `'failed'`, membuat draft **KEDUA** untuk penjualan yang sama — kalau keduanya sempat ke-post, terjadi double-posting (2× jurnal, 2× potong stok).
2. Kalau request `/post` gagal di jaringan **setelah** server sebenarnya commit (respons hilang di tengah jalan), baris macet `'failed'` selamanya — server menolak `/post` kedua (400, karena status sudah POSTED) sehingga tidak pernah ter-reconcile, dan kasir bisa input ulang transaksi yang sebenarnya sudah tercatat (duplikat manual oleh manusia).

**Fix**: kondisi create diubah jadi `if (!serverId)` (bukan berdasar status label) — sekali draft berhasil dibuat, retry apa pun tidak akan membuat draft baru. Ditambah `tryReconcile()` — kalau `/post` gagal, cek dulu status faktur di server sebelum menandai `'failed'`; kalau ternyata sudah POSTED, tandai `'synced'` (bukan gagal).

## Rekomendasi Lanjutan — status per Ronde 4 (lihat `EVALUASI-RONDE2.md`)

Ronde 1 mencatat 8 item di bawah sebagai "belum diubah". User kemudian minta semuanya diperbaiki. 7 dari 8 item **sudah diperbaiki** (detail lengkap tiap fix + test regresi ada di `EVALUASI-RONDE2.md`, bagian "Ronde 4"); 1 item (**R4**) sengaja tetap di-skip atas pilihan eksplisit user, bukan keputusan teknis sepihak.

| # | Temuan | Status |
|---|---|---|
| R1 | **Budget-guard TOCTOU** (`apps/api/src/modules/projects/budget-guard.service.ts`) — cek "spent so far" lalu insert baris baru tanpa lock; dua jurnal yang menyentuh bucket budget sama nyaris bersamaan berpotensi keduanya lolos walau total menembus hard-block. | ✅ **Diperbaiki** — `pg_advisory_xact_lock` per bucket, dikunci di awal `check()`. Test: `apps/api/test/budget-guard.spec.ts`. |
| R2 | **Periods TOCTOU** — `assertOpen()` dan `closePeriod()` tidak saling exclude lewat lock; window kecil di mana posting jurnal bisa "menyelinap" pas periode ditutup di tengah transaksi lain. | ✅ **Diperbaiki** — shared/exclusive advisory lock per periode, dipakai konsisten di `PeriodsService`, `JournalsService`, dan `FiscalYearClosingService`. Test: `apps/api/test/periods.spec.ts`. |
| R3 | **Idempotency key untuk `createDraft`** (sales/purchases web) — double-click/retry bisa bikin draft duplikat. | ✅ **Diperbaiki** — kolom `idempotencyKey` (migrasi baru) + check-before-create + client generate UUID sekali per form mount. Test: `apps/api/test/idempotency.spec.ts`. |
| R4 | **Rounding pajak**: komentar di `money.ts` mengklaim "pembulatan ke bawah (PER-03/PJ/2022)" tapi implementasi selalu `ROUND_HALF_EVEN`. | ⏭️ **Sengaja di-skip** (pilihan eksplisit user) — mengubah rounding mode mengubah nominal pajak pada SEMUA transaksi baru, butuh konfirmasi regulasi DJP resmi yang tidak tersedia. Tidak disentuh. |
| R5 | **Upload `.xlsx`** (`apps/api/src/common/http/multipart.ts`) hanya cek ekstensi nama file, bukan magic bytes. | ✅ **Diperbaiki** — cek signature ZIP `PK\x03\x04`. Test: `apps/api/src/common/http/__tests__/multipart.test.ts`. |
| R6 | **pos-mobile retry loop** tidak membedakan error permanen (400 validasi) vs transient (network/5xx). | ✅ **Diperbaiki** — status baru `'failed_permanent'`, dikecualikan dari retry otomatis. **Tanpa test otomatis** (pos-mobile tidak punya test runner sama sekali) — diverifikasi typecheck + review manual, dicatat eksplisit sebagai gap. |
| R7 | Cakupan test regresi cabang-scope (#1) baru mencakup Sales + Journals secara langsung; 7 modul lain belum punya test IDOR khusus. | ✅ **Diperbaiki** — 19 test baru di `apps/api/test/cabang-scope.spec.ts` mencakup Purchases/Cashbank/Adjustments/Aset/Bukti Potong/Opening Balance/Karyawan/Users. Semua lulus tanpa perlu fix kode baru (membuktikan fix ronde 3 sudah benar di seluruh titik). |
| R8 | Login rate-limiter bersifat in-memory per-proses — tidak konsisten lintas instance kalau API di-scale horizontal. | ✅ **Diperbaiki** — dipindah ke Redis (`ioredis`, `RedisModule`/`RedisService` baru). Test: `apps/api/test/login-throttle.spec.ts` (termasuk test cross-instance). |

## File yang Diubah

**Baru:**
- `apps/api/src/modules/auth/login-throttle.service.ts` + `__tests__/login-throttle.test.ts`
- `apps/api/test/cabang-scope.spec.ts`
- `apps/api/test/cashbank-payment.spec.ts`
- `packages/shared/src/__tests__/schemas.test.ts`
- `review-perbaikan.patch` (diff dari semua perubahan di atas)

**Diubah:**
- `apps/api/src/modules/sales/sales.service.ts`
- `apps/api/src/modules/purchases/purchases.service.ts`
- `apps/api/src/modules/cashbank/cashbank.service.ts`
- `apps/api/src/modules/adjustments/adjustments.service.ts`
- `apps/api/src/modules/journals/journals.service.ts`
- `apps/api/src/modules/payroll/payroll.service.ts`
- `apps/api/src/modules/aset/aset.service.ts`
- `apps/api/src/modules/bukti-potong/bukti-potong.service.ts`
- `apps/api/src/modules/auth/auth.service.ts`, `auth.module.ts`
- `apps/pos-mobile/lib/queue.ts`
- `packages/shared/src/schemas.ts`, `money.ts`

## Cara Menerapkan / Menjalankan

Perubahan **sudah diterapkan langsung ke working tree** (bukan cuma file patch). Untuk memverifikasi ulang dari awal:

```bash
pnpm docker:up                    # Postgres 16 + Redis
pnpm db:generate
pnpm typecheck                    # 5 paket, harus bersih
pnpm test                         # unit — harus 59 lulus
pnpm test:int                     # integrasi — butuh DB lentera_test ter-migrate + rls.sql, harus 42 lulus
```

Kalau ingin melihat diffnya sebagai satu file: `review-perbaikan.patch` di root repo (`git apply review-perbaikan.patch` dari commit sebelum audit ini kalau perlu re-apply di clone lain).
