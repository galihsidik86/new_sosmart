# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Lentera** — sistem akuntansi & pajak Indonesia, multi-tenant + multi-cabang.
Stack: **Next.js 15 (App Router) + NestJS 10 (Fastify) + Prisma 5 + Postgres 16 (RLS) + Redis**.
Monorepo dikelola dengan **pnpm workspaces**.

**Status fase**: ✅ Fase 1 · ✅ Fase 2 · ✅ Fase 3 · ✅ Fase 4 · ✅ Fase 5 · ✅ Fase 6 · ✅ Fase 7 · ✅ Fase 8 (laporan keuangan SAK ETAP) · ⏭ Fase 9 (Coretax integration).

`Akuntansi.dc.html`, `colors_and_type.css`, dan `support.js` adalah **artefak desain** (Design Component) yang menjadi referensi visual + spec UI; implementasi nyata ada di `apps/web` (Next.js) dan `apps/api` (NestJS).

## Layout

```
apps/
  api/          # NestJS — REST /api/v1/*
  web/          # Next.js 15 — App Router + Tailwind (tema port dari colors_and_type.css)
packages/
  db/           # Prisma schema + migrasi + RLS SQL + seed
  shared/       # money (decimal.js), enum domain, zod schemas, helper pajak ID
infra/
  postgres/init # bash init: bikin user app non-superuser
docker-compose.yml
```

## Commands

```bash
pnpm docker:up         # Postgres 16 + Redis
pnpm db:generate       # prisma generate
pnpm db:migrate        # prisma migrate dev (buat / apply migrasi baru)
psql "$DATABASE_URL" -f packages/db/prisma/sql/rls.sql   # WAJIB setelah migrasi awal
pnpm db:seed           # seed PT Sinar Niaga Sentosa + COA + tarif pajak
pnpm dev               # API:4000 + Web:3000 paralel
pnpm typecheck         # tsc -r di semua paket
pnpm db:studio         # Prisma Studio
```

Demo login: `owner@lentera.id` / `lentera123` (OWNER, semua cabang),
`akuntan@lentera.id` / `lentera123` (AKUNTAN, hanya cabang SMG).

## Arsitektur penting

### Multi-tenant + multi-cabang

- `Tenant` = badan usaha (1 NPWP pusat).
- `Cabang` = lokasi/divisi (NPWP cabang `-.001`, `-.002`, …).
- `User` ↔ `Tenant` via `Membership` (role: `OWNER/ADMIN/AKUNTAN/KASIR/AUDITOR`).
- `MembershipCabang` opsional: kalau kosong → akses **semua** cabang dalam tenant.

### Row-Level Security (RLS) — non-negotiable

- Setiap tabel multi-tenant punya kolom `tenant_id UUID NOT NULL`.
- Policy Postgres: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- Runtime app **WAJIB** pakai user `lentera_app` (non-superuser) — RLS hanya berlaku untuk role non-BYPASSRLS. Superuser `lentera` dipakai hanya untuk migrasi/seed.
- `APP_DATABASE_URL` dipakai oleh `PrismaService`; `DATABASE_URL` (superuser) hanya untuk Prisma CLI.

### Konteks tenant per-request

1. `JwtAuthGuard` (global) — validasi access token, set `req.user`.
2. `TenantGuard` (per-controller) — baca `x-tenant-id` header, verifikasi membership, set `req.tenantCtx`.
3. `TenancyInterceptor` (per-controller) — bungkus handler di `AsyncLocalStorage.run(req.tenantCtx, ...)`.
4. `TenancyService.run(fn)` — bungkus query dalam `$transaction` + `SET LOCAL app.tenant_id = ...`. **Semua** query yang menyentuh tabel multi-tenant **harus** lewat `TenancyService.run()`, bukan `PrismaService` langsung.

Pola pemakaian di service:

```ts
return this.tenancy.run((tx) => tx.cabang.findMany());   // di-scope tenant
```

Saat **INSERT** baris baru: RLS hanya **filter**, tidak inject kolom. Kolom `tenantId` wajib di-set manual dari `TenantContext.require().tenantId`.

### Konvensi uang

- DB: `DECIMAL(20, 2)` saja. **JANGAN PERNAH** pakai `Float`/`Double`/`number` JS untuk uang.
- App layer: `decimal.js` (set ke `ROUND_HALF_EVEN`, precision 28).
- Helper di `@lentera/shared`:
  - `money(v)`, `sumMoney(xs)`, `moneyToDb(v)` (string aman untuk insert)
  - `formatRp(v)`, `formatPlain(v)` — `id-ID` locale
  - **Pajak Indonesia** (mengacu PMK 131/2024, UU HPP, PMK 168/2023):
    - `hitungPpn(dpp, { tarif, skema: 'EFEKTIF_11'|'EFEKTIF_12'|'KHUSUS' })`
    - `dppNilaiLain(harga)` — 11/12 × harga (skema efektif 11%)
    - `hitungPph23(dpp, { tarif, penerimaPunyaNpwp })` — 100% surcharge kalau tanpa NPWP
    - `hitungPph4Ayat2`, `hitungPphBadan`, `hitungPphUmkmFinal`

### COA (Chart of Accounts)

- Per-tenant, hierarkis (`parentId` self-relation).
- Hanya akun `isPostable = true` (leaf) yang boleh dijurnal — parent agregat.
- `kind`: `ASET | LIABILITAS | EKUITAS | PENDAPATAN | BEBAN_POKOK | BEBAN | PENDAPATAN_LAIN | BEBAN_LAIN`.
- `normalBalance`: `DEBIT | KREDIT` — dipakai engine GL untuk validasi & sign of saldo.
- Seed (`packages/db/prisma/seed.ts`) bikin COA standar perusahaan dagang Indonesia + saldo awal demo.

### Master data (Fase 2)

- **Item**: barang & jasa. Field penting:
  - `klasifikasiPpn`: `BKP | JKP | NON_BKP | BKP_STRATEGIS | BEBAS_PPN` — engine faktur Fase 4 pakai ini untuk memutuskan baris kena PPN apa tidak.
  - `isJasa`: kalau true, transaksi pembelian otomatis trigger PPh 23 (Fase 7).
  - `akunPendapatanId / akunPersediaanId / akunHppId`: snapshot akun default per item (override per faktur tetap mungkin).
- **Vendor**: `isPkp` kritikal — hanya vendor PKP yang menerbitkan faktur pajak masukan yang bisa dikreditkan.
- **Customer**: `isPkp` menentukan apakah faktur pajak diterbitkan; `kreditLimit` dipakai validasi penjualan kredit (Fase 4).
- **ItemStokAwal**: per item per cabang per tanggal. Fase 5 akan baca ini sebagai opening balance kartu stok.

### Periode buku (Fase 2)

- `FiscalYear` + `FiscalPeriod` (12 periode bulanan biasanya).
- Status: `OPEN | CLOSING | CLOSED`.
- **`PeriodsService.assertOpen(tx, date)`** wajib dipanggil oleh **semua** handler posting transaksi sebelum INSERT jurnal. Throw `ForbiddenException` kalau periode di tanggal tsb sudah CLOSED. **Lupa = celah audit serius.**
- Chain rule: tidak boleh tutup periode N kalau periode N-1 masih OPEN. Tidak boleh buka periode N kalau periode N+1 sudah CLOSED.
- Reopen butuh `alasan` (disimpan di `catatanTutup` untuk jejak audit).

### GL Engine (Fase 3) — non-negotiable invariants

- **D=K dipaksakan di 3 layer**:
  1. **Zod schema** (`createJournalInputSchema`) — refine `.lines` agar SUM(debit) == SUM(kredit) > 0.
  2. **Service** (`JournalsService.post`) — re-check `td.eq(tk)` dengan `decimal.js` sebelum set status POSTED.
  3. **Postgres CHECK + trigger** (`gl-constraints.sql`):
     - `journal_lines.debit >= 0`, `kredit >= 0`, `(debit > 0) XOR (kredit > 0)` per baris.
     - `journals.total_debit = total_kredit` per header.
     - DEFERRED trigger `trg_journal_lines_balance` re-validate SUM(lines) = header totals di COMMIT, hanya untuk status non-DRAFT.
     - Trigger `trg_journal_line_account_check` blokir baris yang menunjuk akun non-postable / non-active.
- **Status lifecycle**: `DRAFT → POSTED → REVERSED`. POSTED **tidak boleh diedit** — harus reverse + re-create.
- **Reversal**: `JournalsService.reverse(id, { alasan })` terbitkan jurnal baru dengan D↔K terbalik, sumber sama, `reversedFromId` & `reversedById` di-link kedua arah. Jurnal asli jadi REVERSED. Tanggal pembalik bisa beda periode asalkan periode pembalik OPEN.
- **Penomoran**: `SequenceService.next(tx, 'JU', tanggal)` pakai `SELECT … FOR UPDATE` di tabel `sequences` per (tenant, kode bulanan). Format: `JU-2026-05-0001`. Dialokasi **saat POST**, bukan saat DRAFT (supaya nomor tidak hilang kalau draft dibuang).
- **Source tracking**: setiap jurnal punya `sumber` enum (MANUAL/PENJUALAN/PEMBELIAN/KAS_BANK/PENYUSUTAN/…) + `sumberRef` (ID dokumen sumber) — Fase 4+ pakai ini untuk telusur balik dari laporan ke faktur.
- **Buku besar (`LedgerService.buku`)**:
  - Saldo awal periode = `account.saldoAwal` + Σ POSTED lines sebelum `period.startDate` (di-sign sesuai `normalBalance`).
  - Saldo berjalan dihitung per baris dalam-periode dengan `applySign(normalBalance, debit-kredit, mutation=true)`.
- **Neraca saldo (`TrialBalanceService.build`)**: 2 query `groupBy(accountId)` (sebelum + dalam periode) × seluruh akun postable. Output split ke kolom Debit/Kredit (salah satu nol per akun). `balanced = totals.mutasiDebit.eq(mutasiKredit)`.
- **Posting downstream**: modul Fase 4+ (penjualan/pembelian/kas) tidak boleh INSERT langsung ke `journals` — mereka harus pakai `JournalsService.createDraft` + `.post` agar lewat semua validasi & alokasi nomor.

### Transaksi (Fase 4) — auto-posting & invariant Indonesia

- **SalesInvoice**: header + lines (snapshot harga/klasifikasi PPN/akun). Status `DRAFT → POSTED → PARTIAL/PAID → CANCELLED`. `.post()` alokasi `INV-YYYY-MM-NNNN`, build journal lines lalu panggil `JournalsService.createDraft`+`.post`. `journalId` di-link kembali ke faktur.
  - Skema posting penjualan (kredit): **D** Piutang Usaha (totalNetto), **K** Pendapatan per akun (sum DPP), **K** Utang PPN Keluaran (totalPpn).
  - Skema posting penjualan (tunai): akun `akunArId` user pilih = kas/bank langsung.
- **PurchaseInvoice**: idem dengan `BILL-YYYY-MM-NNNN`. PPN masukan **hanya kalau vendor PKP**. PPh 23 dipotong **oleh kita** kalau ada baris jasa dan `potongPph23=true` — vendor tanpa NPWP kena surcharge 100% (sesuai UU PPh).
  - Skema posting pembelian (kredit): **D** Persediaan/Beban per line (sum DPP per akun), **D** PPN Masukan (totalPpn), **K** Utang Usaha (totalNetto = DPP+PPN−PPh23), **K** Utang PPh 23 (totalPph23).
- **CashBankEntry**: `RECEIPT` (BKM) → D kas/bank, K akun lawan; `PAYMENT` (BKK) → sebaliknya; `TRANSFER` (BMT) antar akun kas/bank tanpa baris lawan. Kalau ada `salesInvoiceId`/`purchaseInvoiceId`, otomatis update `totalDibayar` & status faktur (POSTED → PARTIAL → PAID).
- **PPN PMK 131/2024**: tarif PPN 12%, tapi default `tarifPpnPersen=11` di app artinya **DPP nilai lain 11/12** → efektif 11%. Pilih 12 hanya untuk BKP mewah (DPP penuh).
- **Klasifikasi PPN per line**: `BKP/JKP` kena PPN; `BKP_STRATEGIS/NON_BKP/BEBAS_PPN` tidak. Snapshot di-clone dari item saat faktur dibuat (tahan terhadap rename item).
- **Cancel = reverse**: kalau faktur sudah POSTED, `.cancel()` panggil `JournalsService.reverse(journalId, ...)` → terbitkan pembalik + set status `CANCELLED`. Faktur yang sudah ada pelunasan (PARTIAL/PAID) tidak bisa di-cancel — kasir wajib batalkan bukti kas/bank dulu.

### Inventory (Fase 5) — FIFO/Average + auto-HPP

- **`Tenant.costMethod`**: `FIFO` atau `AVERAGE`. Jangan ganti setelah ada transaksi (UU PPh konsistensi).
- **`StokMovement`**: sumber tunggal kebenaran kartu stok. Setiap event simpan `saldoQty` + `saldoNilai` snapshot — query saldo terkini = movement terakhir per (item, cabang).
- **`InventoryService` pakai advisory lock** (`pg_advisory_xact_lock`) keyed per (tenant, item, cabang) supaya tidak ada race condition.
- **FIFO**: `StokLot` per movement INBOUND. `StokLotKonsumsi` link outbound ke lot (boleh pecah lintas lot, lot tertua keluar duluan).
- **AVERAGE**: tidak pakai lot — harga pokok outbound = `prevSaldoNilai / prevSaldoQty`.
- **Auto-HPP saat sales POST**: `SalesService.post()` walk lines item barang (bukan jasa), panggil `recordOutbound`, lalu terbitkan **jurnal HPP terpisah** (sumber sama, `sumberRef` sama). Skema: **D HPP** per `akunHppId`, **K Persediaan** per `akunPersediaanId`. Pointer di `SalesInvoice.hppJournalId`.
- **Auto-inbound saat purchase POST**: walk lines item barang, `hargaPokokPerUnit = dpp / qty`, panggil `recordInbound`. Jurnal utama sudah D Persediaan jadi tidak perlu jurnal terpisah.
- **Cancel sales/purchase**: reverse **3 hal** — jurnal utama, jurnal HPP (kalau sales), stok movements via `inventory.reverseInbound` (walk all movements by `sumberType+sumberId`).
- **Opname (`StokAdjustment`)**: snapshot `qtySaatIni` saat draft, hitung delta saat fisik diisi. Post auto-record `OPNAME_PLUS/MINUS` + jurnal: delta+ → **D Persediaan / K 7-103**; delta- → **D 6-109 / K Persediaan**.
- **Stok awal**: seed bikin movement `STOK_AWAL` + lot dari `ItemStokAwal`. Tanpa ini sales POST gagal "stok tidak cukup".
- **DB invariants** (gl-constraints.sql): `StokMovement.qty_in XOR qty_out`, `StokLot.qty_terpakai ≤ qty_masuk`.

### Aset Tetap (Fase 6) — UU PPh + auto-penyusutan

- **Default masa manfaat** (Pasal 11 UU PPh) ada di `AsetService.MASA_MANFAAT_DEFAULT`:
  - Bangunan Permanen 240 bln / Non-Permanen 120 bln
  - Kelompok I 48 / II 96 / III 192 / IV 240 bln
- **Bangunan WAJIB Garis Lurus** — zod refine + UI disabled metode untuk bangunan.
- **Engine penyusutan** (`DepresiasiService.calc`):
  - Garis Lurus: `(hargaPerolehan − nilaiResidu) / masaManfaatBulan`, dikap supaya nilai buku tidak < residu.
  - Saldo Menurun: `nilaiBuku × (2 / masaManfaatBulan)` per bulan, juga dikap.
- **Run bulanan** (`runAndPost(periode)`):
  - Idempotent via `@@unique([tenantId, periode])` di `DepresiasiRun`.
  - Pilih semua aset AKTIF dengan `mulaiPenyusutan ≤ akhir periode` dan `lastDepresiasiPeriode < periode`.
  - Tulis `DepresiasiLine` per aset (snapshot nilai buku sebelum/sesudah + akumulasi sesudah untuk audit).
  - Update snapshot di `AsetTetap`: `akumulasiPenyusutan`, `nilaiBuku`, `lastDepresiasiPeriode`.
  - Bangun **1 jurnal gabungan**: D Beban Penyusutan per `akunBebanId`, K Akumulasi per `akunAkumulasiId` (di-group supaya cabang yang berbeda akun masuk baris berbeda).
- **Chain rule cancel**: hanya periode terakhir yang POSTED yang boleh di-cancel — kalau ada run setelahnya, cancel periode terakhir dulu. Cancel reverse jurnal + rollback snapshot ke periode sebelumnya (`lastDepresiasiPeriode` mengikut `DepresiasiLine` sebelumnya).
- **Disposal** (`AsetService.dispose`): satu jurnal dengan 4 sisi:
  - DIJUAL: **D** Kas/Bank (hargaJual), **D** Akumulasi (semua akumulasi), **K** Aset (hargaPerolehan), **D/K** `7-102 Laba Penjualan Aset` atau `8-103 Rugi Penjualan Aset` (selisih hargaJual − nilaiBuku).
  - RUSAK/PENSIUN: **D** Akumulasi, **D** `8-103 Rugi…` (sebesar nilai buku), **K** Aset.
  - Pointer `disposalJournalId` disimpan; status berubah ke `DIJUAL/RUSAK/PENSIUN`.
- **Undispose**: reverse `disposalJournalId` + set status AKTIF. Untuk koreksi salah input.
- **Akun bawaan** (seed COA):
  - 1-201 Tanah / 1-202 Bangunan / 1-203 Akum. Bangunan
  - 1-204 Kendaraan / 1-205 Akum. Kendaraan
  - 1-206 Peralatan & Mesin / 1-207 Akum. Peralatan
  - 6-103 Beban Penyusutan (general)
  - 7-102 Laba Penjualan Aset / 8-103 Rugi Penjualan Aset

### Pajak (Fase 7) — Payroll, Bupot, SPT Masa

- **`Karyawan`** model: NIK 16 digit, NPWP 15/16 digit (opsional — tanpa NPWP kena surcharge 20% di PPh 21), `ptkpStatus` (TK_0..K_3 + HB_*), gaji pokok + tunjangan + iuran BPJS karyawan default.
- **TER table** (`apps/api/src/modules/payroll/ter-table.ts`): bracket bawah–menengah (>99% pegawai) sudah cocok dgn sumber independen PMK 168/2023; bracket teratas (bruto > `TER_UNVERIFIED_BRUTO_MIN` = Rp700jt/bulan, tarif 30–34% kategori B/C) masih **direkonstruksi** — verifikasi ke Lampiran PDF resmi DJP sebelum dipakai klien high-earner. Engine `lookupTer` agnostic jumlah bracket; `lookupTerDetail` menandai `unverified`.
  - **Gate TER**: `PayrollService.post()` MEM-BLOKIR posting bila ada line dgn bruto di zona belum-terverifikasi kecuali `konfirmasiTerTinggi=true` (throw + sebut nama karyawan). UI payroll: banner keras + baris bertanda ⚠ + checkbox konfirmasi `required` sebelum Jalankan & Post. Kasus bruto normal tak terpengaruh.
- **Mapping PTKP → kategori TER**: A=TK_0, B=TK_1/K_0/TK_2, C=TK_3/K_1/K_2/K_3/HB_*. Helper di `@lentera/shared/enums` (`PTKP_TO_KATEGORI`) dan duplicated di `PayrollService` untuk DB enum.
- **`PayrollService.calcLine`**: bruto = gaji + tunjangan; tarif TER lookup; tanpa NPWP × 1.2; PPh 21 = bruto × tarif; take-home = bruto − PPh21 − BPJS − potonganLain.
- **`PayrollService.post`**: alokasi `PR-YYYY-MM-NNN`, 1 jurnal gabungan (D Beban Gaji 6-101, K Utang PPh 21 2-1022, K Utang BPJS 2-106, K Kas/Bank). **Auto-generate BuktiPotong PPh 21 per karyawan** dengan nomor `BP21-YYMMNNNN` untuk SPT Masa.
- **Unique** `(tenantId, cabangId, periode)` — 1 run per cabang per bulan (mendukung skema payroll per-cabang).
- **`BuktiPotongService.generateFromPurchaseInvoice`** dipanggil otomatis dari `PurchasesService.post` — setiap line dengan PPh 23 menghasilkan 1 bukti potong dengan nomor `BP23-YYMMNNNN`. Idempotent via `sumberType/sumberId` check.
- **`SptPpnService.build`**: list semua faktur penjualan POSTED dengan PPN > 0 (keluaran) + tagihan vendor PKP dengan PPN > 0 (masukan). Selisih = kurang/lebih bayar PPN masa pajak.
- **`SptPphService.build`**: rekap bukti potong per (periode, jenisPph). Bupot DIBATALKAN di-exclude dari total.
- **Catatan e-Faktur XML / NSFP**: ditunda ke Fase 9 (Coretax integration). Field `nsfp` & `kodeFakturPajak` sudah ada di `SalesInvoice`, siap dipakai saat integrasi DJP.
- **Akun PPh terkait**: 2-1022 Utang PPh 21, 2-1023 Utang PPh 23, 2-1024 Utang PPh 25/29, 2-1025 Utang PPh 4(2), 2-106 Utang BPJS Karyawan, 6-101 Beban Gaji & Tunjangan.

### Laporan Keuangan (Fase 8) — SAK ETAP

- **Tidak ada model DB baru** — semua laporan dihitung on-the-fly dari `journal_lines` + `accounts`.
- **`helpers.ts`**: `aggregateAllAccounts(tx, opts)` adalah single query agregat pakai `groupBy(accountId)` dgn 2 sub-query (sebelum periode untuk saldo awal + dalam periode untuk mutasi). Filter by `JournalStatus.POSTED` saja. Return Map<accountId, …> untuk lookup cepat. `mutasiSigned` / `saldoAkhirSigned` handle sign flipping berdasarkan `normalBalance`.
- **`LabaRugiService.build({ periodId, ytd })`**: agregasi 5 kind (PENDAPATAN, BEBAN_POKOK, BEBAN, PENDAPATAN_LAIN, BEBAN_LAIN). Layout: Pendapatan − HPP = Laba Kotor; − Beban Operasi = Laba Usaha; ± Lain-lain = Laba Sebelum Pajak; − PPh = Laba Bersih. Mode `ytd=true` agregasi dari awal tahun buku.
- **`NeracaService.build({ periodId })`**: saldo akhir per akun ASET/LIABILITAS/EKUITAS s/d `endDate`. Group ASET 1-10*=lancar / 1-20*=tetap; LIABILITAS 2-10*=pendek / 2-20*=panjang. **Inject laba berjalan tahun buku** ke ekuitas supaya `Aset = Liabilitas + (Ekuitas + Laba Berjalan)` balanced. Return `balanced: boolean` + `selisih` untuk validasi.
- **`ArusKasService.build({ periodId })` — METODE TIDAK LANGSUNG**:
  - **Operasi**: Laba Bersih + Penyusutan (akun 6-103) − Δ Aset Lancar non-kas + Δ Liabilitas Jangka Pendek.
  - **Investasi**: − Δ Aset Tetap (1-201, 1-202, 1-204, 1-206 — perolehan dan disposal).
  - **Pendanaan**: + Δ Utang Bank (2-201) + Tambahan Modal (3-101) − Dividen (3-104).
  - Validasi: `kasAwal + kenaikanBersih ≈ kasAkhir` (toleransi 0.5 rupiah).
- **`PerubahanEkuitasService.build({ periodId })`**: saldo awal Modal (3-101) + Saldo Laba (3-102), + tambahan modal periode, + laba bersih periode, − dividen (3-104) = saldo akhir.
- **Klasifikasi laporan = DATA di Account, bukan prefix kode** (sejak migrasi `add_klasifikasi_neraca`):
  - Neraca (lancar/tetap, pendek/panjang) baca `Account.klasifikasiNeraca`; Arus Kas menentukan saldo kas dari `Account.isKasSetara`. Kedua field di-bootstrap dari konvensi prefix seed saat migrasi/seed/import, lalu **bisa disunting** di Bagan Akun › Edit Akun. Menata ulang kode COA tidak lagi memecah laporan diam-diam.
  - Helper `klasifikasiAset/klasifikasiLiabilitas` (helpers.ts) menerima akun & baca field; fallback ke prefix HANYA kalau field null (defensif).
  - Akun tunggal bernama yang dirujuk laporan pakai `gl_config` (`GlConfigKey`): Arus Kas pendanaan/investasi & Perubahan Ekuitas → `MODAL_DISETOR`, `LABA_DITAHAN`, `DIVIDEN`, `BEBAN_PENYUSUTAN`, `UTANG_BANK`. Ubah di Pengaturan › Akun Default.
  - Masih berbasis kode (belum digeneralisasi): line-item modal kerja seksi operasi Arus Kas (Δ Piutang 1-103, Persediaan 1-104, dst.). Tapi di sini kesalahan bersifat LOUD — balance check `kasAwal + kenaikan ≈ kasAkhir` akan gagal, bukan diam-diam. Neraca-lah yang dulu senyap, dan itu sudah ditutup.
- **Sign convention**: helper `mutasiSigned` & `saldoAkhirSigned` selalu return **signed saldo normal positif** (debit-normal: +D −K, kredit-normal: +K −D). Negative berarti abnormal balance (mis. saldo kredit di akun aset = overdraft).
- **Tidak ada caching** — kalau jurnal jumlahnya jutaan, perlu materialized view per (tenant, periode, account). Untuk SME demo cukup recompute on-demand.

### TaxRate

- Per-tenant; tiap baris menunjuk akun utang/piutang (mis. `2-1021` Utang PPN, `1-105` PPN Masukan).
- Modul transaksi nanti (Fase 4+) baca `TaxRate.akunUtangId` untuk auto-posting jurnal pajak.

## Konvensi koding

- TypeScript strict, `experimentalDecorators` di api (NestJS).
- ESM (`"type": "module"`). Import path antar file di `apps/api` pakai akhiran `.js` (NodeNext + tsc).
- Validasi input: **Zod**, lewat `ZodValidationPipe`. Jangan campur dengan class-validator.
- Bahasa: error message, label, copy = **Bahasa Indonesia**. Kode/identifier = English.
- Endpoint pakai prefix `/api/v1/*`. Header tenant: `x-tenant-id`.
- Setiap controller multi-tenant **WAJIB** pasang `@UseGuards(TenantGuard)` + `@UseInterceptors(TenancyInterceptor)`. Lupa = query lolos dari ALS = RLS reject (kalau pakai user app) atau bocor lintas tenant (kalau pakai superuser).

## Patterns yang sudah ada (jangan diulang)

- **Auth refresh rotation**: lihat `apps/api/src/modules/auth/auth.service.ts`. Refresh token disimpan sebagai SHA-256 hash; rotasi pada setiap pakai.
- **Cookie session di web**: `httpOnly` access + refresh; cookie `lentera_user` & `lentera_tenant` non-httpOnly untuk dipakai komponen client kalau perlu (lihat `apps/web/lib/session.ts`).
- **TenantContext + ALS**: jangan bikin singleton baru untuk konteks request — pakai `TenantContext.require()` di service.

## UI / Frontend (apps/web) — design system Sembada

Referensi visual: `Akuntansi.dc.html` + `colors_and_type.css` (**Sembada**).
Perubahan visual didokumentasikan di `docs/UI-AUDIT.md` (changelog).

**WAJIB pakai primitives di `apps/web/components/ui/` — jangan tulis ulang UI inline.**
Impor dari barrel `@/components/ui`. Primitives inti:
- Layout: `PageContainer` (size `list|form|report|wide`, padding responsive), `PageHeader` (title/subtitle/actions), `Card`/`Section`/`SectionHeader`.
- Form: `FormField`+`Label`, `Input`/`Select`/`Textarea` (prop `numeric`/`mono`/`fullWidth`), `Button` (variant `primary|secondary|ghost|danger|soft-sogan|soft-emas|success|soft-bata|dashed`, `buttonClass()` untuk `<a>`/`<Link>`).
- Data: `Table`/`THead`/`TH`/`TBody`/`TR`/`TD`/`MoneyCell`/`EmptyRow`, dan **`DataTable`** deklaratif (`columns` + `rows` + `empty`) untuk halaman list.
- Status/feedback: `Badge`/`StatusBadge`/`statusVariant`, `StatusBanner`, `Chip`, `StatusBanner`, `EmptyState`, `Skeleton`, `StatCard`, `Money`, `Modal`, `Segmented`, `Icon`.
- Filter: `FilterBar`/`filterBarClass` + `FilterLabel`; toggle status/tipe pakai segmented control (link) atau `Segmented`.

**Konvensi:**
- **Angka uang**: di tabel → `font-mono tabular-nums` (atau `MoneyCell`); headline/KPI/total → serif Fraunces via `Money`/`.t-money`. Format `id-ID` (helper `fmtRp`/`fmtPlain` di `lib/format`). Desimal hanya bila ada sen.
- **Palet Sembada saja**: `sogan/cream/tanah/padi/emas/bata/wedel/info`. JANGAN pakai warna Tailwind default (`amber`, `gray`, dll) atau shade tak terdefinisi (mis. `tanah-400`, `wedel-700` → tak ter-generate, tak berwarna). Shade tanah valid: 100/300/500/700/900.
- **Kontras WCAG AA**: teks di atas cream pakai `tanah-500`/`tanah-700`; `tanah-300` hanya placeholder/dekoratif.
- **Shell**: sidebar (`components/Sidebar.tsx`) gelap + ber-ikon + grouping domain; Topbar (`components/Topbar.tsx`) dirender oleh `app/(app)/layout.tsx` (breadcrumb dari pathname — tiap halaman TIDAK render Topbar sendiri). Halaman auth pakai split-layout brand.
- **Responsive**: grid form `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; halaman list+form `grid-cols-1 lg:grid-cols-3` (list `lg:col-span-2`); tabel dibungkus `overflow-x-auto`. JANGAN pakai `grid grid-cols-2/3/N` kolom-tetap tanpa base 1 kolom (jebol di 375px), dan JANGAN taruh anak `col-span-2/3` di grid yang base-nya 1 kolom → paksa kolom implisit + overflow; pakai `col-span-full` atau `sm:col-span-2`.
- **Motion/a11y**: transisi `duration-fast ease-sembada`; `focus-visible` ring pada elemen interaktif; entrance `animate-lent-fade`.
- Loading: `app/(app)/loading.tsx` (skeleton global). Empty: `DataTable` prop `empty` / `EmptyState`.

Katalog komponen hidup di rute `/ui-kit`. Kalau butuh pola baru yang berulang, **buat primitive di `components/ui/` dulu**, jangan inline.

## Rekonsiliasi Bank

Modul `bank-reconciliation` (worksheet manual, tanpa import CSV rekening koran — itu follow-up). Rute web `/pembukuan/rekonsiliasi`.
- **Model**: `BankReconciliation` (per akun kas/bank + tanggal cut-off + `saldoRekeningKoran`) + `BankReconciliationLine` (join ke `journal_line`, `journalLineId` **@unique** → satu baris hanya bisa "cleared" di ≤1 rekonsiliasi). Enum `BankReconciliationStatus` (DRAFT/SELESAI).
- **Akun yang boleh direkonsiliasi**: `Account.isKasSetara && isPostable` (lihat [Klasifikasi laporan]).
- **Matematika worksheet** (`buildWorksheet`): saldo buku = `saldoAwal + Σ(debit−kredit)` POSTED s/d cut-off; item beredar = baris belum di-clear (debit → setoran dalam perjalanan, kredit → pembayaran belum kliring); **bank disesuaikan = saldoRekeningKoran + setoran − pembayaran**; `selisih = saldoBuku − bankDisesuaikan`. Identitas cek: nothing-cleared + statement 0 → `selisih = saldoAwal`.
- **Lifecycle**: create (cegah >1 DRAFT/akun) → toggle cleared per baris → `finalize` (WAJIB `|selisih| ≤ 0.5`, snapshot saldoBuku+selisih) → `reopen`/`delete` (DRAFT saja). Biaya admin/jasa giro yang cuma ada di bank dibukukan via jurnal penyesuaian dulu, lalu barisnya muncul untuk dicentang.
- RLS + GRANT kedua tabel di `prisma/sql/rls.sql` (manual sekali di DB live setelah `migrate deploy`).

## Coretax

Adapter akan ditulis di Fase 9. Pendekatan: kontrak XML/JSON sesuai spec DJP public 2025, default mode `mock` (in-memory sandbox), switch ke `production` setelah Sertifikat Elektronik PKP tersedia.
