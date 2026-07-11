# UI Changelog — Sembada Design System (apps/web)

Dokumen ini semula **laporan audit UI** (gap analysis). Seluruh temuan utama
sudah dikerjakan; kini dokumen berfungsi sebagai **changelog visual** +
ringkasan sistem. Untuk aturan pemakaian komponen di sesi berikutnya, lihat
`CLAUDE.md` bagian **UI / Frontend**.

Sumber kebenaran visual: `Akuntansi.dc.html` + `colors_and_type.css`
(design system **Sembada**). Implementasi: `apps/web/components/ui/`.

---

## Ringkasan status temuan audit awal

| # Temuan audit awal | Status |
|---|---|
| Tidak ada design primitives → drift | ✅ **Selesai** — lapisan `components/ui/` (25+ primitives) |
| Sidebar polos tanpa ikon | ✅ **Selesai** — sidebar gelap ber-ikon + active indicator + collapsible |
| Tipografi angka 2-tingkat tak konsisten | ✅ **Selesai** — mono (`tabular-nums`) di tabel, serif Fraunces di KPI/total |
| Login datar + bocor palet `amber` | ✅ **Selesai** — split-layout gradien sogan + batik + emas |
| Skala tipografi tak di-reify | ✅ **Selesai** — kelas `.t-*` + `PageHeader` konsisten |
| Tabel drift | ✅ **Selesai** — `Table`/`DataTable` primitives |
| Filter bar dua idiom | ✅ **Selesai** — `FilterBar`/`filterBarClass` + segmented |
| Polish interaksi hilang | ✅ **Selesai** — `lent-fade`, hover, focus-visible, transisi |
| Empty/loading lemah | ✅ **Selesai** — `loading.tsx` global (Skeleton) + `EmptyRow`/`EmptyState` |
| Lebar kontainer & padding drift | ✅ **Selesai** — `PageContainer` (responsive) |
| Token `info` hilang, `.t-*`/batik tak di-port | ✅ **Selesai** — Fase 0 |

---

## Changelog per fase

### Fase 0 — Foundations (token)
- Token `info`, shadow `xl`/`inner`, `transitionTimingFunction.ease-sembada`,
  durasi `fast/base/slow`, keyframes+animation `lent-fade` di `tailwind.config.ts`.
- Kelas tipografi semantik (`.t-display-*`, `.t-h*`, `.t-eyebrow`, `.t-money`,
  `.t-label`, `.t-caption`, `.t-mono`) + motif `.batik-overlay` di `globals.css`.
- Aset motif `public/assets/patterns/kawung.svg`.

### Fase 1 — Primitives (`components/ui/`)
Button, Input/Select/Textarea, FormField/Label, Card/Section/SectionHeader,
PageHeader, PageContainer, FilterBar, Badge/StatusBadge, StatusBanner, Chip,
EmptyState, Skeleton, Money, Table (+MoneyCell/EmptyRow), **DataTable**,
StatCard, Modal, Segmented, Icon. Katalog hidup di **`/ui-kit`**.

### Fase 2 — Shell
Sidebar ber-ikon + drawer mobile, Topbar frosted, `template.tsx` (transisi
`lent-fade`), `loading.tsx` (skeleton global).

### Fase 3 — Migrasi semua modul
Auth, Dashboard, Laporan (12), Transaksi (15), Master (9),
Pembukuan/Persediaan/Aset/Pajak/Pengaturan (~31). Topbar dipindah ke
`layout.tsx` (breadcrumb dari pathname; identitas spesifik dibawa PageHeader).

### Redesign app shell
Sidebar **gelap** (gradien sogan-800→900) + active indicator emas +
grouping per domain + workspace switcher + collapsible (localStorage).
Topbar: user-menu avatar dropdown + chip periode. Login & pilih-tenant:
split-layout brand gradien + emas + batik.

### Dashboard & Transaksi (komponen baru)
- Dashboard: grid StatCard operasional (Kas & Bank, Piutang, Utang, Laba Bulan
  Berjalan) + panel "Ringkasan Keuangan · YTD" angka **mono**.
- List penjualan/pembelian/kas-bank: **`DataTable`** deklaratif + filter
  **segmented**.
- Form InvoiceForm/JurnalForm/CashBankForm: **section bertahap** (1 Informasi ·
  2 Baris · 3 Ringkasan), total **menonjol** (band sogan-50, mono 2xl),
  tombol Post/Simpan primary jelas.

### Polish akhir
- **Responsive** (375/768/1280): sidebar drawer di mobile, form grid
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `PageContainer` padding
  `px-4 sm:px-6 lg:px-8`, DataTable scroll horizontal (`overflow-x-auto`).
- **Kontras WCAG AA**: `text-tanah-400` (shade tak valid — tak ter-generate)
  diganti `text-tanah-500` (≥4.5:1 di atas cream). Teks muted memakai
  `tanah-500`; `tanah-300` hanya untuk placeholder/dekoratif (exempt).
- **Micro-interaction**: `focus-visible` ring pada nav sidebar & filter
  segmented; hover baris DataTable; transisi `duration-fast ease-sembada`.
- **Angka**: seluruh nominal Rupiah `font-mono` + `tabular-nums`, format ribuan
  `id-ID` (titik). Angka headline/KPI pakai serif Fraunces (`.t-money`).

---

## Aturan singkat (detail di CLAUDE.md)
- **Selalu** pakai primitives `@/components/ui` — jangan tulis ulang
  kartu/tombol/input/badge/tabel inline.
- Angka uang: `font-mono tabular-nums` (tabel) atau `Money`/`.t-money` (KPI).
- Halaman: `PageContainer` + `PageHeader`; list: `DataTable`; form: `FormField`
  + `Input`/`Select` dalam `Card` + `SectionHeader`.
- Palet Sembada saja (sogan/cream/tanah/padi/emas/bata/wedel/info); jangan
  pakai warna Tailwind default (`amber`, `gray`, dst) atau shade tak terdefinisi.
