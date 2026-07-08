# Evaluasi & Perbaikan — Ronde 2 (Lentera Accounting)

Tanggal audit: 8 Juli 2026 · Repo: `new_sosmart` (branch `main`)
Lingkup: **kode BARU/BERUBAH sejak audit ronde 1** (commit `362decd`, "fix(security,integrity): audit menyeluruh") sampai `HEAD` (`0ef678c`) — fitur Saldo Awal Terintegrasi, Tutup Buku Akhir Tahun, dan fix mekanisme reversal GL. Total 34 file berubah di rentang ini; yang benar-benar direview mendalam adalah kode produksi baru (bukan file yang cuma kena `prisma format` ulang).

Prioritas review sesuai permintaan: **auth → uang/pembayaran → tenancy & IDOR → validasi input → race condition**.

## Ringkasan

Fitur Saldo Awal Terintegrasi dan Tutup Buku secara struktur sudah solid (pola tenancy/RLS/D=K diikuti dengan benar di jalur utamanya), tapi review ronde 2 ini menemukan **7 bug terbukti (CONFIRMED)** — 1 di otorisasi, 2 di integritas uang, 2 di isolasi tenant/cabang (IDOR), 2 di race condition — semuanya di kode yang BARU ditambahkan sejak ronde 1, bukan regresi di kode lama. Validasi input (NaN/URL/SSRF/traversal) **bersih, tidak ada temuan** — disiplin pemakaian `lineMoney`/`isoDateStrict`/`.uuid()` di skema baru konsisten dengan pola lama.

Ronde 2 awalnya mencatat 3 hal lagi sebagai "rekomendasi" (pre-existing, di luar cakupan). User minta ketiganya diperbaiki juga — lihat **"Temuan CONFIRMED — Ronde 3 (bug lama)"** di bawah. Total sekarang **10 bug CONFIRMED**, semua sudah diperbaiki + ada test regresi (kecuali fix #1, konfigurasi decorator, diverifikasi baca kode bukan unit test).

**Hasil test (dijalankan sungguhan, DB Postgres asli sudah jalan sebelum mulai review — bukan disimulasikan):**

| | Sebelum ronde 2 | Sesudah ronde 2 | Sesudah ronde 3 (bug lama) |
|---|---|---|---|
| `pnpm typecheck` (5 paket) | bersih | bersih | bersih |
| `pnpm test` (unit) | 59 lulus | 62 lulus (+3) | **62 lulus** (tidak ada unit test baru di ronde 3) |
| `pnpm test:int` (integrasi, Postgres asli) | 50 lulus | 54 lulus (+4) | **57 lulus** (+3 baru) |

Perintah verifikasi:
```bash
docker ps                # lentera_postgres, lentera_redis sudah "Up (healthy)" — dicek dulu sebelum klaim apa pun
pnpm typecheck
pnpm test
pnpm test:int
```

## Catatan keamanan proses: 2 percobaan prompt injection terdeteksi (ronde 2 + ronde 3)

- **Ronde 2** (review tenancy/IDOR): salah satu sub-agent melaporkan salah satu output tool `Bash` yang dibacanya berisi blok yang menyamar sebagai `<system-reminder>` palsu (klaim "tanggal berubah" + daftar agent type palsu).
- **Ronde 3** (riset scope bug LabaRugiService): sub-agent lain melaporkan tool-result terakhir berisi `<system-reminder>` palsu yang mengklaim plan mode aktif dan menyuruh beralih ke perilaku "menulis file plan".

Keduanya pola khas prompt injection yang disisipkan ke dalam teks output tool, BUKAN dari harness sungguhan. **Kedua sub-agent mengenali dan mengabaikannya dengan benar**, tidak mempengaruhi hasil review. Dicatat sesuai kebijakan "flag prompt injection ke user" — tidak ada tindakan lebih lanjut diperlukan karena tidak berdampak.

## Metodologi

1. Baseline: start DB (sudah jalan), `pnpm typecheck && pnpm test && pnpm test:int` — semua hijau sebelum mulai.
2. Peta lingkup: `git diff 362decd..HEAD --stat` → 34 file. Dikonfirmasi diff `schema.prisma` yang tampak besar (857+/773-) murni `prisma format` (re-alignment komentar), bukan perubahan substantif — cek langsung isi diff-nya baris per baris untuk memastikan.
3. 5 sub-agent riset paralel (read-only, tidak mengedit apa pun), masing-masing fokus SATU kategori (auth/uang/tenancy/validasi/race), diberi daftar file eksplisit + pola "benar" yang harus dibandingkan (dikutip dari `CLAUDE.md` dan kode sibling yang sudah established).
4. **Setiap temuan sub-agent diverifikasi ulang secara manual** (baca file asli, telusuri call-path) sebelum diputuskan CONFIRMED atau dibuang — tidak ada temuan yang langsung dipercaya dari laporan sub-agent tanpa verifikasi independen.
5. Fix langsung + komentar Bahasa Indonesia di titik perubahan.
6. Test baru per bug (unit untuk logika murni, integration untuk yang butuh DB/RLS/konkurensi sungguhan).
7. Full regression run sampai hijau.

## Yang sudah benar (tidak diubah)

- **RLS untuk tabel baru** (`saldo_awal`, `saldo_awal_akun_lines`): `ENABLE`+`FORCE ROW LEVEL SECURITY` + policy `tenant_id = app_current_tenant()` pada `USING` **dan** `WITH CHECK` — pola persis sama dengan tabel-tabel lama, tidak ada yang bocor atau lupa di-enable.
- **Arah closing entry Tutup Buku** (`fiscal-year-closing.service.ts`): diturunkan manual kasus per kasus (akun normal-debit/kredit × saldo normal/abnormal) — benar di semua 4 kombinasi, termasuk akun kontra (Retur Penjualan).
- **Fix `JournalStatus.POSTED` → `{in: JOURNAL_BALANCE_STATUSES}`** (dari sesi sebelumnya) diverifikasi ulang diterapkan konsisten di ke-5 file yang seharusnya, tidak ada yang terlewat atau salah tempel.
- Guard baru di `accounts.service.ts` yang mengunci `saldoAwal` akun subsidiary (Piutang/Utang/Persediaan) dari edit langsung — resolusi akun subsidiary di-query ulang di transaksi yang sama, tidak bisa di-spoof.
- `opening-balance.controller.ts`/`fiscal-year-closing.controller.ts`: guard `TenantGuard`+`RolesGuard`+`TenancyInterceptor` lengkap di semua endpoint.
- **Validasi input**: semua skema Zod baru (`closeFiscalYearInputSchema`, `saldoAwal*InputSchema`, dll.) pakai `lineMoney`/`isoDateStrict`/`.uuid()` konsisten — tidak ada regresi dari bug lama yang pernah didokumentasikan di `schemas.ts` ("Sebelumnya lineMoney cuma...").

## Temuan CONFIRMED (terbukti, sudah diperbaiki)

### 1. [AUTH] `void()` saldo awal bisa dieksekusi AKUNTAN — seharusnya OWNER/ADMIN saja

**Masalah.** `opening-balance.controller.ts` cuma pasang `@Roles('OWNER','ADMIN','AKUNTAN')` di level CLASS, berlaku sama untuk `post` maupun `void`. Padahal `void()` membatalkan **satu-satunya run saldo awal tenant sekaligus** (reverse semua jurnal + stok + restore `Account.saldoAwal`) — dampaknya tenant-wide, bukan satu dokumen. Fitur sibling yang dibuat di sesi yang sama (`fiscal-year-closing.service.ts`) justru dengan sengaja membedakan: `close-year` boleh AKUNTAN, `reopen-year` (aksi "buka kunci"-nya) cuma OWNER/ADMIN — konvensi yang sama persis seharusnya dipakai di sini juga, dan memang sudah ada helper `canCancelPosted` (`OWNER`/`ADMIN` saja) di `apps/web/lib/roles.ts` yang justru TIDAK dipakai di halaman ini (dipakai `canPostAccounting` yang lebih longgar).

**Fix.**
- `apps/api/src/modules/opening-balance/opening-balance.controller.ts` — tambah `@Roles('OWNER', 'ADMIN')` di method `void()`, override level-class (dikonfirmasi lewat baca `RolesGuard`: `Reflector.getAllAndOverride([handler, class])` — metadata di handler MENANG kalau ada).
- `apps/web/app/(app)/pengaturan/saldo-awal/page.tsx` — tombol Void sekarang digate `canCancelPosted(s.role)`, bukan `canPostAccounting(s.role)` lagi (cuma UX hint, enforcement sungguhan di server).

**Verifikasi.** Tidak ditambah unit test (ini konfigurasi decorator, bukan logika murni) — diverifikasi lewat pembacaan langsung `RolesGuard`/`Roles` decorator source, dan full regression suite tetap hijau.

### 2. [UANG] Faktur/tagihan saldo awal bisa di-post lewat endpoint faktur BIASA, membobol cross-check D=K wizard

**Masalah.** `SalesService.post()`/`PurchasesService.post()` punya cabang `if (inv.isSaldoAwal)` yang MEMBANGUN jurnal (D Piutang/K Kliring atau sebaliknya) dan langsung nge-set status POSTED — dipanggil dari endpoint faktur generik `/sales/:id/post` / `/purchases/:id/post` yang bisa diakses OWNER/ADMIN/AKUNTAN kapan saja, TIDAK cuma dari wizard Saldo Awal. Halaman faktur biasa (`/transaksi/penjualan/[id]`) tidak menyaring `isSaldoAwal` sama sekali — tombol "Post Faktur" tetap muncul untuk baris saldo awal.

Sementara itu `OpeningBalanceService.buildPreviewInTx()` (penghitung cross-check "Debit = Kredit") cuma menjumlah baris piutang/utang dengan `status: DRAFT`. Begitu satu baris ke-post lewat jalur faktur biasa (di luar wizard), baris itu **hilang dari perhitungan selisih** — wizard bisa saja menyatakan "balanced" padahal akun kliring (3-105) sebenarnya menyisakan saldo tidak nol **permanen**, bertentangan langsung dengan janji fitur ini ("terbukti balance secara matematis").

**Fix.** `SalesService.post()`/`PurchasesService.post()`: cabang `isSaldoAwal` sekarang **menolak** (`BadRequestException`) alih-alih ikut memposting — memaksa SEMUA posting baris saldo awal lewat `OpeningBalanceService.post()` (yang sudah punya logic-nya sendiri secara independen, dikonfirmasi tidak pernah memanggil `SalesService.post()`/`PurchasesService.post()`, jadi aman diblok total).

**Verifikasi.** Test baru `apps/api/test/opening-balance.spec.ts` → `'SalesService.post()/PurchasesService.post() menolak invoice isSaldoAwal — wajib lewat wizard'`: tambah 1 piutang + 1 utang draft, coba post langsung lewat `sales.post()`/`purchases.post()`, harus `BadRequestException`, invoice tetap DRAFT tanpa `journalId`.

### 3. [UANG] Preview persediaan pakai angka mentah, posting sungguhan membulatkan per baris — bisa beda hasil

**Masalah.** `buildPreviewInTx()` menjumlah `qty × hargaPokokPerUnit` MENTAH (tanpa pembulatan per baris) untuk `totalPersediaan`. Tapi `post()` (posting sungguhan) membulatkan TIAP BARIS ke 2 desimal (`.toDecimalPlaces(2)`) SEBELUM dijumlah. Karena `qty` adalah `DECIMAL(20,4)` dan `hargaPokokPerUnit` adalah `DECIMAL(20,2)`, hasil kali keduanya rutin punya >2 desimal — ini bukan kasus langka.

Contoh nyata (dari review, diverifikasi lewat unit test): 2 baris `qty=12.005 × harga=5.00`. Jumlah mentah = **120.05**. Jumlah setelah dibulatkan per baris (`60.025 → 60.02`, ROUND_HALF_EVEN) = **120.04**. Selisih Rp 0.01 — kecil tapi nyata, dan bisa lebih besar dengan lebih banyak baris (test kedua: 7 baris `qty=1.005` menghasilkan selisih Rp 0.04). Akibatnya: preview bisa bilang "balanced" padahal setelah posting akun kliring nyisa beberapa sen, ATAU sebaliknya preview menolak input yang sebenarnya sudah pas.

**Fix.** `buildPreviewInTx()`: `totalPersediaan` sekarang dijumlah dengan `.toDecimalPlaces(2)` PER BARIS dulu, persis sama formula dengan `post()`.

**Verifikasi.** Unit test baru `apps/api/src/modules/opening-balance/__tests__/persediaan-rounding.test.ts` (3 test, murni Decimal — tanpa DB) — membuktikan selisih formula lama vs formula benar dengan angka konkret, dan mengunci formula yang benar supaya tidak diam-diam berubah lagi.

### 4. [TENANCY/IDOR] `itemId` di `setPersediaan()` tidak divalidasi milik tenant sendiri

**Masalah.** `addPiutang`/`addUtang` memvalidasi `customerId`/`vendorId` lewat query ter-scope RLS (`tx.customer.findUnique`/`tx.vendor.findUnique`) sebelum dipakai. `setPersediaan()` TIDAK melakukan hal yang sama untuk `itemId` — langsung dipakai sebagai foreign key di `upsert()`. Karena constraint FK di Postgres **tidak** ditembus RLS (beda dari SELECT biasa), `itemId` milik tenant lain (kalau UUID-nya diketahui/ditebak) bisa lolos ke `ItemStokAwal` — menghasilkan baris yang `tenantId`-nya benar tapi `itemId`-nya menunjuk item yang untuk tenant ini sendiri tidak pernah terlihat (invisible lewat RLS), yang kalau di-`include: {item}` nanti (di `listPersediaan()`/`post()`) meledak karena relasi wajib resolve ke null.

**Fix.** `setPersediaan()`: tambah `tx.item.findUnique({where: {id: l.itemId}})` per baris sebelum upsert, tolak dengan `BadRequestException` kalau tidak ketemu — pola identik dengan `customerId`/`vendorId`.

**Verifikasi.** Test baru: bikin tenant kedua + item milik tenant itu, coba `setPersediaan` dari tenant pertama pakai `itemId` tenant kedua → `BadRequestException`, dan dipastikan tidak ada `ItemStokAwal` nyasar yang ke-create.

### 5. [TENANCY/IDOR] List & hapus piutang/utang/persediaan saldo awal bocor lintas cabang

**Masalah.** `addPiutang`/`addUtang`/`setPersediaan` (sisi TULIS) sudah benar memanggil `cabangScope.assertAccess(cabangId)`. Tapi `listPiutang`/`listUtang`/`listPersediaan` (sisi BACA) tidak memfilter berdasarkan cabang sama sekali, dan `removePiutang`/`removeUtang`/`removePersediaan` (sisi HAPUS) tidak memanggil `assertAccess` sebelum delete. Ini persis kelas bug yang sudah didokumentasikan sendiri di komentar `sales.service.ts` ("RLS cuma menjamin isolasi tenant — cabang belum dicek..."), tapi lolos lagi di modul baru ini.

**Dampak.** User AKUNTAN yang `MembershipCabang`-nya dibatasi ke Cabang A bisa **melihat** baris piutang/utang/persediaan saldo awal Cabang B (sama tenant), dan bisa **menghapusnya**, walau tidak punya akses ke cabang itu.

**Fix.** `listPiutang`/`listUtang`/`listPersediaan`: tambah filter `cabangId: {in: scope}` kalau user restricted (pola `cabangIdsForWhere()` yang sudah baku di modul lain). `removePiutang`/`removeUtang`/`removePersediaan`: tambah `cabangScope.assertAccess(row.cabangId)` setelah fetch, sebelum delete.

**Verifikasi.** Test baru: bikin Cabang B, isi 1 baris piutang+utang+persediaan di sana (sebagai OWNER full-access), lalu coba akses sebagai user yang di-restrict ke Cabang A saja — list HARUS tidak menampilkan baris Cabang B, remove HARUS `ForbiddenException`. Dikonfirmasi juga OWNER full-access tetap bisa lihat & hapus (bukti ini murni soal pembatasan cabang, bukan bug lain).

### 6. [RACE] `getOrCreateRunInTx` — dua request bersamaan bisa tabrakan create / dobel-posting

**Masalah.** `SaldoAwal` dibatasi `@@unique([tenantId])` (satu run per tenant selamanya). `getOrCreateRunInTx()` melakukan `findUnique` lalu (kalau kosong) `create`, tanpa lock — dua request bersamaan (double-click, dua tab) bisa sama-sama lolos `findUnique` kosong lalu tabrakan di `create` (500 mentah, bukan error yang rapi). Yang lebih parah: `post()`/`void()` membaca status run di AWAL transaksi (`assertDraft`) tapi baru menulis status baru di AKHIR — dua `post()` bersamaan bisa **sama-sama lolos precondition check**, sama-sama membangun & memposting jurnal lengkap (akun manual + persediaan + tiap piutang/utang), menghasilkan **jurnal dobel** yang merusak invariant "akun kliring net nol" yang jadi inti fitur ini.

**Fix.** Tambah `pg_advisory_xact_lock` per-tenant (pola identik `InventoryService.lockItem`, transaction-scoped, auto-release saat commit/rollback) di AWAL `getOrCreateRunInTx()` — dipanggil oleh SEMUA method publik di service ini (satu titik perbaikan menutup seluruh kelas race, termasuk TOCTOU antara `preview()` dan re-fetch di dalam `post()`). Request kedua sekarang BLOK sampai request pertama commit, baru baca status yang sudah ter-update dan gagal bersih lewat `assertDraft` yang sudah ada.

**Verifikasi.** Test baru: tembak `ob.post()` dua kali bersamaan (`Promise.allSettled`) pada run yang sama-sama balanced — HARUS persis 1 yang berhasil, 1 ditolak `BadRequestException` bersih (bukan P2002 mentah, bukan dua-duanya berhasil), dan cuma **1 jurnal** SALDO_AWAL yang benar-benar tercipta di DB (bukan 2).

### 7. [RACE] `closeFiscalYear`/`reopenFiscalYear` — kelas bug yang sama persis

**Masalah.** Pola identik dengan temuan #6: precondition check (`fy.status === OPEN`, semua periode kecuali terakhir CLOSED) dan penulisan status baru ada di transaksi yang sama tapi tanpa lock — dua `closeFiscalYear()` bersamaan untuk `fiscalYearId` yang sama bisa sama-sama lolos precondition, sama-sama memposting jurnal penutup lengkap → laba tahun itu **dipindah 2× ke Laba Ditahan**.

**Fix.** Tambah `pg_advisory_xact_lock` per-`fiscalYearId` di awal `closeFiscalYear()` dan `reopenFiscalYear()`, pola sama dengan #6.

**Verifikasi.** Tidak ditambah test konkurensi terpisah (sudah ada 4 test `close-fiscal-year.spec.ts` yang tetap hijau membuktikan fix tidak merusak alur normal) — pola fix-nya identik dan sudah dibuktikan bekerja lewat test konkurensi di temuan #6 (`pg_advisory_xact_lock` adalah primitif Postgres yang sama, bukan logika kustom yang berbeda per file).

## Temuan CONFIRMED — Ronde 3 (bug lama, dipilih user untuk diperbaiki)

Ketiga item ini AWALNYA dicatat sebagai "rekomendasi, di luar cakupan" (pre-existing, bukan regresi dari kode ronde 2). User memilih ketiganya untuk diperbaiki sekarang. Riset ulang (4 sub-agent paralel + verifikasi manual line-by-line) menemukan item #1 **jauh lebih luas dari dugaan awal** — bukan cuma 1 file, tapi 4 file independen.

### 8. [UANG] Bug kind-based summation salah arah akun kontra — ada di **4 laporan independen**, bukan cuma LabaRugiService

**Masalah.** Riset awal (ronde 2) cuma menyebut `LabaRugiService`. Riset ulang (ronde 3) menemukan **3 file LAIN** dengan bug PERSIS SAMA, masing-masing implementasi terpisah (bukan reuse satu sama lain): `NeracaService` (`labaBerjalan`), `PerubahanEkuitasService` (`labaBersih` — bagian ekuitas per-akun via GlConfig sudah BENAR, cuma bagian ini yang salah), `ArusKasService` (`labaBersih`). Semua menjumlah `mutasiSigned()` langsung ke bucket per-`kind` tanpa koreksi untuk akun kontra (`normalBalance` tidak cocok arah yang "diharapkan" untuk `kind`-nya) — akun kontra (Retur Penjualan 4-103, Potongan Penjualan 4-104, Retur Pembelian 5-102) ikut DITAMBAH bukan DIKURANG. Akibatnya laba bersih/laba berjalan salah di SEMUA 4 laporan sekaligus, dan `NeracaService` bisa salah nyatakan "tidak seimbang" kapan pun ada aktivitas retur (karena `labaBerjalan` yang salah ikut masuk `totalEkuitas`).

**Fix.** 1 helper baru `plKindContribution()` di `apps/api/src/modules/reports/helpers.ts` (sign murni dari `normalBalance` per akun, sama pola dengan `FiscalYearClosingService` yang sudah benar dari awal), dipakai di 4 file dengan diff 1 baris masing-masing (`laba-rugi.service.ts`, `neraca.service.ts`, `perubahan-ekuitas.service.ts`, `arus-kas.service.ts`). `BudgetActualService` dicek — sudah benar dari awal (per-akun, bukan per-kind), tidak disentuh.

**Verifikasi.** Extend `apps/api/test/close-fiscal-year.spec.ts` (fixture Retur Penjualan sudah ada di situ) — sebelum tutup buku, panggil `labaRugi.build()`, `neraca.build()`, `perubahanEkuitas.build()`, `arusKas.build()` untuk skenario yang sama (Retur 500rb), semua HARUS menghasilkan `3500000.00` yang SAMA PERSIS dengan `FiscalYearClosingService.labaBersih` (cross-report consistency check) — dan baris Retur Penjualan di Laba Rugi harus tampil `-500000.00` (bukan `+500000.00`). Digrep juga semua 8 file spec — dipastikan tidak ada assertion lama yang melibatkan akun kontra yang bakal berubah nilainya (2027-scenario di file yang sama tidak menyentuh akun kontra sama sekali).

### 9. [TENANCY/IDOR] `cabangScope.assertAccess()` no-op untuk full-access — cabangId lintas-tenant lolos di **15 titik + 2 kasus khusus**

**Masalah.** Riset awal cuma bilang "ada di beberapa tempat, pola sama seperti `sales.service.ts`". Riset ulang (grep sistematis semua service yang terima `cabangId` dari body) menemukan **15 titik langsung** (`sales`/`purchases`/`cashbank`/`adjustments`.`createDraft`+`updateDraft`, `journals.createDraftInTx`+`updateDraft`, `aset.create`, `bukti-potong.createManual`, `opening-balance.addPiutang`+`addUtang`+`setPersediaan`) **+ 2 kasus khusus**: `karyawan.service.ts` (paling parah — **tidak inject `CabangScopeService` sama sekali**, bahkan no-op check pun tidak ada) dan `users.service.ts` (assign `MembershipCabang.cabangId` via `assertCanManage`, dipanggil di luar transaksi jadi butuh pola beda). Root cause: `assertAccess()` no-op total untuk OWNER/ADMIN (`cabangIds===null`), dan FK constraint Postgres tidak ditembus RLS — `cabangId` tenant lain (kalau ketebak) bisa lolos ke `.create()`/`.update()`.

**Fix.** Method baru `CabangScopeService.assertOwnedByTenant(tx, cabangId)` (assertAccess + `tx.cabang.findUnique` scoped-RLS) dipakai di 15 titik. `karyawan.service.ts`: tambah injeksi `CabangScopeService` + panggil di `create`/`update`. `users.service.ts`: method terpisah `assertCabangIdsOwnedByTenant()` (query mandiri via `tenancy.run()`, dipanggil setelah `assertCanManage()` karena tidak ada `tx` di scope situ) — tidak restrukturisasi `assertCanManage` yang sudah ada (risiko lebih tinggi, banyak percabangan `this.prisma` superuser vs `tenancy.run()`).

**Verifikasi.** Full regression run SEGERA setelah 15+2 titik diedit (checkpoint terpisah sebelum nulis test baru) — **54/54 test lama tetap lulus** tanpa ada yang perlu diubah, membuktikan fix tidak mengubah behavior jalur normal. Test baru di `apps/api/test/cabang-scope.spec.ts`: 2 modul representatif (Sales, OpeningBalance) — OWNER (full-access) coba `createDraft`/`addPiutang` dengan `cabangId` milik **tenant lain** (bukan cabang lain dalam tenant yang sama, itu sudah dites di describe block existing) → `BadRequestException` "Cabang tidak ditemukan".

### 10. [UANG] Reset `Account.saldoAwal` buang saldo lama akun kontrol tanpa jejak GL — **dikonfirmasi nyata di tenant demo saat ini**

**Masalah.** Sama seperti rekomendasi awal, tapi riset ulang mengonfirmasi ini BUKAN cuma teoretis: tenant demo "PT Sinar Niaga Sentosa" punya `1-103 Piutang Usaha` (Rp 310.000.000), `1-104 Persediaan` (Rp 540.000.000), `2-101 Utang Usaha` (Rp 268.000.000) ter-seed lump-sum. `post()` me-reset SEMUA `Account.saldoAwal` (termasuk 3 akun kontrol ini) tanpa jurnal apa pun — dicek langsung ke DB, run saldo awal tenant ini saat ini `status: DRAFT` (pernah post+void sekali, ter-restore bersih, 3 akun masih utuh) — jadi belum ada data hilang, TAPI akan hilang permanen kalau wizard diselesaikan (post tanpa void) hari ini.

**Fix.** Opsi "blok keras + escape hatch" (dari 3 opsi yang dianalisis, paling konsisten dengan filosofi fitur ini sendiri — "cross-check otomatis, tidak boleh diam-diam kehilangan data"): `post()` sekarang menolak (`BadRequestException` sebut kode+nama akun) kalau ada akun subsidiary dengan `saldoAwal` legacy nonzero. `AccountsService.update()`'s guard yang sudah ada (blok edit lump-sum ke akun subsidiary) ditambah pengecualian — target PERSIS `0` diizinkan lewat, jadi ada jalur sah untuk "discharge" nilai legacy setelah direkonsiliasi manual.

**Verifikasi.** Test baru: set `saldoAwal` akun Piutang jadi nonzero langsung (simulasi legacy), `post()` dengan input lain yang balanced → `BadRequestException` sebut "Piutang". Lalu `accounts.update(..., saldoAwal: '0')` harus BERHASIL (escape hatch), setelah itu `post()` boleh lanjut.

## Ronde 4 — Rekomendasi Lanjutan `EVALUASI.md` (R1–R8)

User minta semua 8 item "Rekomendasi Lanjutan" dari audit ronde 1 (`EVALUASI.md`) diperbaiki. **R4** (rounding pajak) di-skip atas pilihan eksplisit user — mengubah `ROUND_HALF_EVEN` mengubah nominal pajak di SEMUA transaksi baru, butuh konfirmasi regulasi DJP resmi yang tidak tersedia, bukan keputusan teknis yang bisa diambil sepihak. 7 item lain (R1, R2, R3, R5, R6, R7, R8) diriset menyeluruh (3 sub-agent paralel + verifikasi manual per temuan) lalu diperbaiki satu-satu, typecheck setelah tiap fix.

**Hasil test:**

| | Sebelum ronde 4 | Sesudah ronde 4 |
|---|---|---|
| `pnpm typecheck` (5 paket) | bersih | bersih |
| `pnpm test` (unit) | 62 lulus | **61 lulus** (net -1: +5 R5, -6 pindah R8 dari unit ke integration) |
| `pnpm test:int` (integrasi, Postgres asli) | 57 lulus | **90 lulus** (+33 baru: R1 +2, R2 +1, R8 +6, R3 +5, R7 +19) |

### R1 — Budget-guard TOCTOU (race condition, uang)

**Masalah.** `BudgetGuardService.check()` baca "spent so far" (`tx.journalLine.aggregate`) per bucket `(project, account, bulan)` tanpa lock. Dua jurnal bersamaan yang sama-sama menyentuh bucket sama bisa sama-sama baca "spent" lama sebelum salah satu commit → keduanya lolos hard-block walau totalnya menembus limit.

**Fix.** `apps/api/src/modules/projects/budget-guard.service.ts` — `pg_advisory_xact_lock` (EXCLUSIVE) per bucket yang relevan (`newDelta > 0`), key `${tenantId}:${projectId}:${accountId}:${periode}`, dikunci SEMUA di awal `check()` (sebelum loop baca nilai), sorted lexicographic supaya 2 jurnal yang sentuh bucket sama dalam urutan terbalik tidak saling deadlock.

**Verifikasi.** Test baru `apps/api/test/budget-guard.spec.ts` (2 test): enforcement normal (jurnal sendirian yang menembus limit ditolak), dan race — 2 jurnal @700rb (limit 1jt) ditembak bersamaan → HARUS ada yang ditolak `BudgetExceededException`, total POSTED tidak boleh menembus limit.

### R2 — Periods TOCTOU (race condition, integritas GL)

**Masalah.** Lebih luas dari dugaan awal: bukan cuma `PeriodsService.assertOpen`/`closePeriod`/`reopenPeriod` yang tidak saling exclude — `JournalsService.createDraftInTx` dan `reverseInTx` punya cek status periode INLINE sendiri, sama sekali tidak lewat `assertOpen`. `FiscalYearClosingService` juga inline update status periode (bypass `PeriodsService` total, alasan circular-dependency yang sudah didokumentasikan).

**Fix.** Skema shared/exclusive lock per periode (key `period:<id>`, fungsi `periodLockKey` di-export dari `periods.service.ts`):
- `PeriodsService.resolvePeriodForDateLocked` (privat) — resolve tanggal → periode, `pg_advisory_xact_lock_shared`, RE-FETCH status setelah lock. `assertOpen` jadi wrapper tipis di atasnya; method publik baru `resolvePeriodForPosting` expose hasil resolve mentah untuk pemanggil yang butuh pesan error sendiri.
- `closePeriod`/`reopenPeriod` — `pg_advisory_xact_lock` (EXCLUSIVE) sebagai statement PERTAMA, sebelum baca status.
- `JournalsService.createDraftInTx`/`reverseInTx` — ganti query inline dengan `this.periods.resolvePeriodForPosting(tx, tanggal)`.
- `FiscalYearClosingService` — method lokal `lockPeriodExclusiveInTx` (tidak bisa inject `PeriodsService`, circular dependency) tapi impor `periodLockKey` (fungsi murni) supaya key TETAP SAMA dan saling exclude dengan lock `PeriodsService`. Dipanggil + re-fetch status fresh sebelum mutasi periode terakhir di `closeFiscalYear`/`reopenFiscalYear`.

**Verifikasi.** Test baru `apps/api/test/periods.spec.ts` — `journals.post()` dan `periods.closePeriod()` ditembak bersamaan pada periode yang sama. Assert deterministik terlepas urutan race: kalau post menang → `postedAt <= closedAt` (mutual exclusion memaksa urutan commit); kalau close menang → post ketolak `ForbiddenException` bersih, jurnal tetap DRAFT. Stabil 3× run berturut-turut (tidak flaky).

### R3 — Idempotency key untuk `createDraft` sales/purchases

**Fix.**
- Migrasi `20260708120000_add_idempotency_key_sales_purchase`: kolom `idempotency_key UUID` nullable di `sales_invoices`/`purchase_invoices` + `@@unique([tenantId, idempotencyKey])` (Postgres unique index abaikan NULL — tidak breaking untuk client lama).
- `packages/shared/src/schemas.ts`: `idempotencyKey: z.string().uuid().optional()` di kedua skema create invoice.
- `SalesService.createDraft`/`PurchasesService.createDraft`: cek `findFirst` by `(tenantId, idempotencyKey)` DULU, return existing kalau ketemu. Backstop race: kalau 2 request lolos check bersamaan, `P2002` dari unique constraint ditangkap DI TRANSAKSI BARU (bukan reuse transaksi yang sudah aborted — Postgres menolak query lanjutan di transaksi yang error) untuk fetch baris pemenang.
- `apps/web/components/InvoiceForm.tsx`: `crypto.randomUUID()` di-generate SEKALI per form mount (`useState(() => ...)`, bukan per submit).

**Verifikasi.** Test baru `apps/api/test/idempotency.spec.ts` (5 test): 2× call key sama → row sama & cuma 1 di DB (Sales + Purchases), race 2 request bersamaan key sama → tetap 1 row (Sales + Purchases), tanpa key → perilaku lama (2 faktur beda) tidak berubah.

### R5 — XLSX magic-byte check

**Fix.** `apps/api/src/common/http/multipart.ts`, `readXlsxUpload` — setelah baca buffer, cek signature ZIP `PK\x03\x04` di 4 byte pertama (`isXlsxMagicBytes`, diexport). Nama file cuma metadata client (gampang dipalsukan, rename `.txt`→`.xlsx`); `.xlsx` sebenarnya container ZIP (OPC), jadi verifikasi byte asli sebelum masuk parser. Satu titik fix meng-cover semua 5 endpoint import (accounts/customers/items/karyawan/vendors).

**Verifikasi.** Unit test baru `apps/api/src/common/http/__tests__/multipart.test.ts` (5 test): buffer valid lolos, text biasa ditolak, buffer kosong/pendek ditolak tanpa crash, varian ZIP lain (`PK\x05\x06`) sengaja tetap ditolak (ketat ke local-file-header saja).

### R6 — pos-mobile retry tidak bedakan error permanen vs transient

**Fix.** `apps/pos-mobile/lib/queue.ts` — status baru `'failed_permanent'` di union `PendingRow['status']`. Helper murni `isPermanentError(status)`: HTTP 4xx yang BUKAN 401/403/408/429 (token/timeout/rate-limit — tetap dianggap transient) diklasifikasi permanent. Kedua catch block di `syncOnce()` set status sesuai klasifikasi. Query retry OTOMATIS (`syncOnce()`, dipicu mount + app-foreground) mengecualikan `'failed_permanent'` — retry ulang pasti gagal lagi dengan payload sama, jadi percuma dan cuma membebani server. `pendingCount()` juga mengecualikan (bukan "menunggu sync"). `riwayat.tsx`: entry baru di `colorMap` (TypeScript memaksa lengkap karena union bertambah) — label "GAGAL PERMANEN — cek data / hapus manual", baris tetap terlihat di riwayat untuk ditindak manual (hapus + input ulang).

**Verifikasi.** **TIDAK ADA test otomatis** — `apps/pos-mobile` sama sekali tidak punya test runner terpasang (`package.json` cuma punya script `start`/`android`/`prebuild`/`typecheck`, tidak ada `test`). Diverifikasi lewat `pnpm --filter pos-mobile typecheck` (bersih — union `PendingRow['status']` yang bertambah dipaksa TypeScript untuk dilengkapi di `colorMap`, jadi tidak mungkin lupa satu tempat) + review manual kode. Dicatat eksplisit sebagai gap, bukan diklaim ter-cover.

### R7 — Tutup gap test coverage cabang-scope (19 test baru)

Dari riset: 7 modul (Purchases, Cashbank, Adjustments, Aset, Bukti Potong, Karyawan, Users) sama sekali belum punya test IDOR cabang-scope walau sudah diperbaiki (kode identik) di ronde 3 temuan #9. Extend `apps/api/test/cabang-scope.spec.ts` (reuse `fullAccessCtx()`/`restrictedToCabangACtx()`/`cabangBId` yang sudah ada) — per modul: restricted-cabang-A (mutasi dokumen cabang B ditolak `ForbiddenException`) + cross-tenant (`cabangId` milik tenant lain ditolak `BadRequestException`), kecuali:
- **Karyawan**: hanya cross-tenant (2 test) — `KaryawanService` cuma panggil `assertOwnedByTenant` kalau `cabangId` di-set (field opsional), tidak ada jalur restricted-role yang relevan untuk dites terpisah.
- **Users**: hanya cross-tenant (2 test) — struktur beda (`assertCanManage`+`assertCabangIdsOwnedByTenant`, bukan `CabangScopeService.assertOwnedByTenant` langsung).
- **OpeningBalance**: 5 test tambahan (restricted-cabang-A untuk `addPiutang`/`addUtang`/`setPersediaan`, cross-tenant untuk `addUtang`/`setPersediaan` — `addPiutang` cross-tenant sudah ada dari ronde 3).

Total 19 test baru (Purchases 2, Cashbank 2, Adjustments 2, Aset 2, Bukti Potong 2, OpeningBalance 5, Karyawan 2, Users 2). Semua **lulus tanpa perlu fix kode baru** — membuktikan fix ronde 3 temuan #9 sudah benar di seluruh 15+2 titik, bukan cuma 2 modul yang dites langsung waktu itu (Sales, OpeningBalance).

### R8 — Login rate-limiter pindah ke Redis

**Masalah.** Lebih luas dari dugaan: Redis SAMA SEKALI belum di-wire ke `apps/api` (tidak ada `ioredis`, tidak ada client/module) walau `REDIS_URL` sudah ada di `.env.example`/`docker-compose.yml` dan container `lentera_redis` sudah jalan.

**Fix.**
- `ioredis` ditambah ke `apps/api/package.json`.
- `apps/api/src/common/redis/{redis.module.ts,redis.service.ts}` baru — `RedisModule` (`@Global()`, pola sama `GlConfigModule`) + `RedisService` (wrap client `ioredis`, baca `REDIS_URL` dari `ConfigService`, fallback `redis://localhost:6379` dev-only).
- `LoginThrottleService` dirombak total: `Map` in-memory → `INCR`+`PEXPIRE` (fixed window, parameter tetap sama: 5 percobaan/15 menit, lockout 15 menit). Method jadi `async` — 3 call site di `auth.service.ts` ditambah `await`.
- `AuthModule` import `RedisModule`.

**Verifikasi.** Unit test lama (`login-throttle.test.ts`, Map in-memory) **dihapus** — digantikan integration test baru `apps/api/test/login-throttle.spec.ts` (6 test, Redis asli): lockout dasar (belum lock di bawah batas, lock setelah 5 gagal, reset setelah sukses, email independen), TTL lock ke-set benar (`PTTL` mendekati 15 menit — pengganti test "auto-unlock setelah window" versi lama yang tidak bisa di-port karena Redis TTL wall-clock asli, tidak bisa di-`vi.useFakeTimers()`), dan **cross-instance**: 2 instance `LoginThrottleService`+`RedisService` terpisah (simulasi 2 proses API) connect ke Redis yang sama — lockout via instance A HARUS kebaca instance B (bukti nyata kenapa R8 perlu: `Map` lama tidak akan pernah lolos test ini).

## Catatan keamanan proses (update): 3 percobaan prompt injection terdeteksi total

Ronde 4 menambah **1 percobaan lagi** (total sekarang 3× sepanjang seluruh sesi ini) — terdeteksi selama fase riset paralel (fake `<system-reminder>` disisipkan ke salah satu tool output yang dibaca sub-agent). Sub-agent mengenali dan mengabaikannya dengan benar, tidak mempengaruhi hasil riset atau fix. Lihat entri ronde 2/3 di atas untuk 2 kejadian sebelumnya.

## Berkas hasil

- `review-perbaikan-v2.patch` — diff lengkap SEMUA fix (ronde 2 + ronde 3 + ronde 4/R1-R8) + test baru (`git diff` terhadap `HEAD` sebelum ronde 2 dimulai — belum ada yang di-commit sama sekali).
- `EVALUASI-RONDE2.md` — dokumen ini.
- `EVALUASI.md` — tabel "Rekomendasi Lanjutan" di-update menandai R1/R2/R3/R5/R6/R7/R8 selesai, R4 di-skip atas pilihan user.

Belum ada yang di-commit — silakan review patch-nya dulu.
