import Link from 'next/link';
import { Input, Select, FilterLabel, filterBarClass, buttonClass } from '@/components/ui';
import { buildListHref } from '@/lib/list-query';

export interface FilterOption {
  id: string;
  kode: string;
  nama: string;
}

/**
 * Bar filter reusable untuk halaman daftar (transaksi & laporan-daftar).
 * Form GET → URL param → server component re-fetch (tanpa client JS).
 *
 * - `search`  : selalu ada — cari nomor / keterangan / partner.
 * - `cabangId`: hanya dirender kalau `cabang` diberikan (halaman memutuskan,
 *   biasanya untuk role pusat & tenant >1 cabang).
 * - `projectId`: hanya dirender kalau `projects` diberikan.
 *
 * Param lain yang sedang aktif (status, periodId, tipe, asOf, dst.) dipertahankan
 * lewat hidden input, jadi filter ini bisa dikombinasikan dengan filter yang ada.
 */
export function ListFilters({
  action,
  params,
  cabang,
  projects,
  industri,
  jenisPelanggan,
  searchPlaceholder = 'Cari nomor / keterangan…',
  ownKeys = ['search', 'cabangId', 'projectId', 'industriId', 'jenisPelangganId'],
}: {
  action: string;
  params: Record<string, string | undefined>;
  cabang?: FilterOption[];
  projects?: FilterOption[];
  industri?: FilterOption[];
  /** Jenis pelanggan (master per-tenant). Hanya di halaman berbasis pelanggan. */
  jenisPelanggan?: { id: string; nama: string }[];
  searchPlaceholder?: string;
  ownKeys?: string[];
}) {
  const preserve = Object.entries(params).filter(
    ([k, v]) => v && !ownKeys.includes(k),
  ) as [string, string][];
  const hasActive = !!(
    params.search || params.cabangId || params.projectId || params.industriId ||
    params.jenisPelangganId
  );

  return (
    <form method="GET" action={action} className={filterBarClass}>
      {preserve.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <div className="flex-1 min-w-[180px]">
        <Input
          name="search"
          defaultValue={params.search ?? ''}
          placeholder={searchPlaceholder}
          aria-label="Cari"
        />
      </div>

      {cabang && cabang.length > 0 && (
        <label className="flex items-center gap-2">
          <FilterLabel>Cabang</FilterLabel>
          <Select
            name="cabangId"
            defaultValue={params.cabangId ?? ''}
            fullWidth={false}
            className="min-w-[140px]"
          >
            <option value="">Semua cabang</option>
            {cabang.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kode} — {c.nama}
              </option>
            ))}
          </Select>
        </label>
      )}

      {projects && projects.length > 0 && (
        <label className="flex items-center gap-2">
          <FilterLabel>Proyek</FilterLabel>
          <Select
            name="projectId"
            defaultValue={params.projectId ?? ''}
            fullWidth={false}
            className="min-w-[150px]"
          >
            <option value="">Semua proyek</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kode} — {p.nama}
              </option>
            ))}
          </Select>
        </label>
      )}

      {industri && industri.length > 0 && (
        <label className="flex items-center gap-2">
          <FilterLabel>Industri</FilterLabel>
          <Select
            name="industriId"
            defaultValue={params.industriId ?? ''}
            fullWidth={false}
            className="min-w-[150px]"
          >
            <option value="">Semua industri</option>
            {industri.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
              </option>
            ))}
          </Select>
        </label>
      )}

      {jenisPelanggan && jenisPelanggan.length > 0 && (
        <label className="flex items-center gap-2">
          <FilterLabel>Jenis</FilterLabel>
          <Select
            name="jenisPelangganId"
            defaultValue={params.jenisPelangganId ?? ''}
            fullWidth={false}
            className="min-w-[150px]"
          >
            <option value="">Semua jenis</option>
            {jenisPelanggan.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nama}
              </option>
            ))}
          </Select>
        </label>
      )}

      <button type="submit" className={buttonClass('primary')}>
        Terapkan
      </button>
      {hasActive && (
        <Link
          href={buildListHref(action, Object.fromEntries(preserve))}
          className={buttonClass('ghost')}
        >
          Reset
        </Link>
      )}
    </form>
  );
}
