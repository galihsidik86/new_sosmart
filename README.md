# Lentera

Sistem akuntansi & pajak Indonesia — multi-tenant, multi-cabang.
Stack: **Next.js 15 + NestJS 10 + Prisma 5 + Postgres 16 (RLS) + Redis**.

> Status: **Fase 1** ✅ · **Fase 2** ✅ · **Fase 3** ✅ · **Fase 4** ✅ · **Fase 5** ✅ · **Fase 6** ✅ · **Fase 7** ✅ · **Fase 8 (Laporan Keuangan)** ✅
> Modul aktif: auth, tenancy + RLS, cabang, COA, tarif pajak, master barang/vendor/pelanggan,
> stok awal, periode buku, jurnal umum, buku besar, neraca saldo,
> faktur penjualan & pembelian, kas/bank, inventory FIFO/Average + opname,
> **aset tetap (Pasal 11 UU PPh)**, **penyusutan bulanan otomatis (garis lurus / saldo menurun)**, **disposal aset (jual/rusak/pensiun) dengan auto-jurnal laba-rugi**.

---

## Prasyarat

- Node ≥ 20.11
- pnpm ≥ 9 (`npm i -g pnpm`)
- Docker Desktop / Docker Engine
- (Opsional) `psql` di PATH untuk menerapkan RLS policy

## Quick start

```bash
# 1. Setup env
cp .env.example .env

# 2. Install dependencies (monorepo)
pnpm install

# 3. Boot Postgres + Redis
pnpm docker:up

# 4. Generate Prisma client + migrasi awal
pnpm db:generate
pnpm db:migrate          # buat migrasi baseline "init"

# 5. Aktifkan Row-Level Security + GL constraints (sekali setelah migrasi)
psql "$DATABASE_URL" -f packages/db/prisma/sql/rls.sql
psql "$DATABASE_URL" -f packages/db/prisma/sql/gl-constraints.sql

# 6. Seed: PT Sinar Niaga Sentosa + 2 cabang + COA + tarif pajak
pnpm db:seed

# 7. Jalankan API (port 4000) + Web (port 3000)
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000) — login dengan:

| Email                 | Password     | Role     | Akses cabang        |
|-----------------------|--------------|----------|---------------------|
| `owner@lentera.id`    | `lentera123` | OWNER    | semua (SMG + SBY)   |
| `akuntan@lentera.id`  | `lentera123` | AKUNTAN  | hanya SMG           |

---

## Arsitektur

```
new_sosmart/
├── apps/
│   ├── api/          # NestJS 10 (Fastify) — REST /api/v1/*
│   └── web/          # Next.js 15 App Router + Tailwind (tema Sembada)
├── packages/
│   ├── db/           # Prisma schema, migrasi, RLS SQL, seed
│   └── shared/       # money utils, enum domain, zod schema
├── infra/
│   └── postgres/init # init script: bikin user aplikasi non-superuser
├── Akuntansi.dc.html # spec UI (Design Component) — referensi visual
├── colors_and_type.css # design tokens Sembada (warna/tipografi/spacing)
└── docker-compose.yml
```

### Multi-tenant + multi-cabang

```
Tenant (perusahaan, 1 NPWP pusat)
 ├── Cabang (NPWP cabang -.001, -.002, …) — banyak cabang per tenant
 └── User (lewat Membership)
       └── MembershipCabang (jika kosong → akses semua cabang)
```

- **Tenant isolation**: setiap tabel berkelas-tenant punya kolom `tenant_id UUID`
  dan policy **Row-Level Security** di Postgres:
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- App runtime pakai user `lentera_app` (non-superuser, RLS aktif).
  Migrasi & seed pakai `lentera` (superuser, bypass RLS).
- Konteks tenant di-pasang di **AsyncLocalStorage** oleh `TenancyInterceptor`
  setiap request, dan `TenancyService.run()` membungkus query di transaksi
  yang sudah `SET LOCAL app.tenant_id = …`.

### Konvensi uang

- DB: `DECIMAL(20, 2)` untuk semua nominal — **JANGAN PERNAH** pakai `float`.
- App layer: `decimal.js` (lihat `packages/shared/src/money.ts`).
- Helper pajak Indonesia siap pakai:
  - `hitungPpn(dpp, { tarif: 12, skema: 'EFEKTIF_11' })` — PMK 131/2024
  - `hitungPph23(dpp, { tarif: 2, penerimaPunyaNpwp: true })`
  - `hitungPph4Ayat2`, `hitungPphBadan`, `hitungPphUmkmFinal`

---

## Endpoint

| Method | Path                            | Auth         | Catatan                                  |
|--------|---------------------------------|--------------|------------------------------------------|
| GET    | `/api/v1/health`                | publik       | health check                             |
| POST   | `/api/v1/auth/login`            | publik       | body `{email, password}`                 |
| POST   | `/api/v1/auth/refresh`          | publik       | body `{refreshToken}` (rotasi)           |
| POST   | `/api/v1/auth/logout`           | publik       | revoke refresh token                     |
| GET    | `/api/v1/tenants/me`            | JWT          | tenant + cabang yang user punya          |
| GET/POST | `/api/v1/cabang`              | JWT + tenant | list / tambah cabang                     |
| GET    | `/api/v1/accounts`              | JWT + tenant | COA. `?view=tree` untuk hierarki         |
| GET/POST/PATCH/DELETE | `/api/v1/items`    | JWT + tenant | master barang & jasa, `?search=`         |
| GET/POST/PATCH/DELETE | `/api/v1/vendors`  | JWT + tenant | master vendor, `?onlyPkp=true`           |
| GET/POST/PATCH/DELETE | `/api/v1/customers` | JWT + tenant | master pelanggan, `?tipe=DISTRIBUTOR`   |
| GET    | `/api/v1/periods/years`         | JWT + tenant | daftar tahun buku + 12 periode           |
| GET    | `/api/v1/periods/resolve?date=` | JWT + tenant | resolve periode untuk tanggal            |
| POST   | `/api/v1/periods/close`         | JWT + tenant | OWNER/ADMIN/AKUNTAN — chain rule berlaku |
| POST   | `/api/v1/periods/reopen`        | JWT + tenant | OWNER/ADMIN — wajib alasan               |
| GET    | `/api/v1/journals`              | JWT + tenant | list jurnal, filter `periodId/status/sumber/search` |
| GET    | `/api/v1/journals/:id`          | JWT + tenant | detail + lines + chain reversal          |
| POST   | `/api/v1/journals`              | JWT + tenant | buat DRAFT (validasi D=K + periode OPEN) |
| POST   | `/api/v1/journals/:id/post`     | JWT + tenant | DRAFT → POSTED, alokasi nomor JU-YYYY-MM-NNNN |
| POST   | `/api/v1/journals/:id/reverse`  | JWT + tenant | terbitkan jurnal pembalik, wajib alasan  |
| DELETE | `/api/v1/journals/:id`          | JWT + tenant | hapus DRAFT (POSTED tidak boleh)         |
| GET    | `/api/v1/ledger?accountId=&periodId=` | JWT + tenant | Buku besar dengan saldo berjalan   |
| GET    | `/api/v1/trial-balance?periodId=` | JWT + tenant | Neraca saldo (saldo awal/mutasi/akhir per akun) |
| GET/POST | `/api/v1/sales-invoices`      | JWT + tenant | List + create draft faktur penjualan |
| GET    | `/api/v1/sales-invoices/:id`    | JWT + tenant | Detail faktur + lines + akun |
| POST   | `/api/v1/sales-invoices/:id/post` | JWT + tenant | DRAFT→POSTED + alokasi INV-YYYY-MM-NNNN + auto-post jurnal |
| POST   | `/api/v1/sales-invoices/:id/cancel` | JWT + tenant | reverse jurnal + status CANCELLED |
| DELETE | `/api/v1/sales-invoices/:id`    | JWT + tenant | hapus DRAFT |
| GET/POST/etc | `/api/v1/purchase-invoices` | JWT + tenant | Idem untuk pembelian (BILL-YYYY-MM-NNNN), dengan PPh 23 |
| GET/POST | `/api/v1/cash-bank`           | JWT + tenant | RECEIPT/PAYMENT/TRANSFER, prefix BKM/BKK/BMT |
| POST   | `/api/v1/cash-bank/:id/post`    | JWT + tenant | Auto-update status AR/AP kalau ada `salesInvoiceId`/`purchaseInvoiceId` |
| GET    | `/api/v1/inventory/saldo`       | JWT + tenant | Saldo stok terkini per (item × cabang), filter `?cabangId=` |
| GET    | `/api/v1/inventory/kartu-stok`  | JWT + tenant | Mutasi stok dengan saldo berjalan, filter `?itemId=&cabangId=&startDate=&endDate=` |
| GET/POST | `/api/v1/stok-adjustments`    | JWT + tenant | Opname/penyesuaian stok (ADJ-YYYY-MM-NNNN) |
| POST   | `/api/v1/stok-adjustments/:id/post` | JWT + tenant | Auto-record movement OPNAME_PLUS/MINUS + jurnal (D persediaan / K 7-103 atau D 6-109 / K persediaan) |
| GET/POST | `/api/v1/aset`                | JWT + tenant | List/create aset tetap (auto-suggest masa manfaat dari kelompok) |
| GET    | `/api/v1/aset/:id`              | JWT + tenant | Detail + riwayat penyusutan |
| POST   | `/api/v1/aset/:id/dispose`      | JWT + tenant | Dispose (DIJUAL/RUSAK/PENSIUN) + auto-jurnal laba-rugi penjualan aset |
| POST   | `/api/v1/aset/:id/undispose`    | JWT + tenant | Reverse dispose (kalau periode jurnal masih OPEN) |
| GET    | `/api/v1/depresiasi/preview?periode=YYYY-MM` | JWT + tenant | Dry-run penyusutan untuk preview |
| GET/POST | `/api/v1/depresiasi/runs`     | JWT + tenant | List run + jalankan run baru (1 per tenant per periode) |
| POST   | `/api/v1/depresiasi/run`        | JWT + tenant | Jalankan + post penyusutan bulanan (auto-jurnal D beban / K akumulasi per aset) |
| POST   | `/api/v1/depresiasi/runs/:id/cancel` | JWT + tenant | Reverse run terakhir (chain rule) |
| GET/POST/PATCH/DELETE | `/api/v1/karyawan`   | JWT + tenant | Master karyawan dengan PTKP + NPWP |
| GET    | `/api/v1/payroll/preview?cabangId=&periode=` | JWT + tenant | Preview perhitungan PPh 21 TER per karyawan |
| GET/POST | `/api/v1/payroll/runs`        | JWT + tenant | List + create draft payroll bulanan |
| POST   | `/api/v1/payroll/runs/:id/post` | JWT + tenant | Post jurnal + auto-generate bukti potong PPh 21 |
| POST   | `/api/v1/payroll/runs/:id/cancel` | JWT + tenant | Reverse + batalkan bukti potong terkait |
| GET/POST | `/api/v1/bukti-potong`        | JWT + tenant | List + create manual (PPh 4(2), dll) — PPh 23 auto-generate dari purchase |
| GET    | `/api/v1/spt/ppn?periodId=`     | JWT + tenant | SPT Masa PPN: keluaran vs masukan + kurang/lebih bayar |
| GET    | `/api/v1/spt/pph?periodId=&jenisPph=` | JWT + tenant | SPT Masa PPh per jenis (21/23/4(2)) |
| GET    | `/api/v1/reports/laba-rugi?periodId=&ytd=` | JWT + tenant | Laba Rugi periode (atau YTD) — Pendapatan, HPP, Beban, Laba Bersih |
| GET    | `/api/v1/reports/neraca?periodId=`  | JWT + tenant | Neraca per akhir periode — Aset = Liabilitas + Ekuitas |
| GET    | `/api/v1/reports/arus-kas?periodId=` | JWT + tenant | Arus Kas YTD metode tidak langsung (3 aktivitas) |
| GET    | `/api/v1/reports/perubahan-ekuitas?periodId=` | JWT + tenant | Saldo awal → tambahan modal + laba − dividen → saldo akhir |

Header tenant: `x-tenant-id: <uuid>` (wajib untuk semua endpoint ber-tenant).
Header cabang (opsional): `x-cabang-id: <uuid>` — dicek ke daftar cabang yang
boleh diakses user.

---

## Catatan jujur soal Coretax

Implementasi adapter Coretax (fase pajak) akan **mock sandbox dulu** karena
API DJP yang riil butuh **Sertifikat Elektronik resmi** + akun PKP terdaftar.
Ketika Anda sudah punya kredensial produksi:

1. Letakkan sertifikat di `infra/coretax/cert/` (sudah di-`.gitignore`).
2. Set env `CORETAX_BASE_URL`, `CORETAX_CLIENT_ID`, `CORETAX_CERT_PATH`.
3. Switch flag `CORETAX_MODE=production` — semua kontrak XML/JSON tetap sama.

Schema XML e-Faktur & e-Bupot mengikuti dokumentasi publik DJP per 2025.

---

## Roadmap

- ✅ **Fase 1**: foundation (auth, tenancy, COA, cabang)
- ✅ **Fase 2**: master barang/vendor/pelanggan + tahun buku & periode (close/reopen)
- ✅ **Fase 3**: GL Engine (jurnal umum DRAFT/POST/REVERSE, buku besar, neraca saldo)
- ✅ **Fase 4**: Penjualan + Pembelian + Kas/Bank dengan auto-post jurnal
- ✅ **Fase 5**: Inventory FIFO/Average + auto-HPP saat penjualan + opname stok
- ✅ **Fase 6**: Aset tetap (UU PPh) + penyusutan bulanan otomatis + disposal
- ✅ **Fase 7**: Pajak — Karyawan + Payroll PPh 21 (TER), Bukti Potong (e-Bupot), SPT Masa PPN & PPh
- ✅ **Fase 8**: Laporan Keuangan SAK ETAP — Laba Rugi, Neraca, Arus Kas, Perubahan Ekuitas
- ⏭ **Fase 4**: penjualan, pembelian, kas/bank
- ⏭ **Fase 5**: inventory + HPP (FIFO/Average)
- ⏭ **Fase 6**: aset tetap + auto-penyusutan
- ⏭ **Fase 7**: pajak (PPN, PPh 21/23/25/4(2), Bupot Unifikasi)
- ⏭ **Fase 8**: laporan keuangan + SPT
- ⏭ **Fase 9**: Coretax integration (mock → produksi)
