'use client';

import { Button, Input } from './ui';

/**
 * Editor multi-link bukti transaksi. Menampilkan daftar input URL yang bisa
 * ditambah/dihapus. Link pertama disimpan sebagai `linkBukti` utama, sisanya
 * ke `linkBuktiTambahan` (lihat splitBukti / mergeBukti).
 */
export function LinkBuktiInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const list = value.length ? value : [''];
  const upd = (i: number, v: string) =>
    onChange(list.map((x, k) => (k === i ? v : x)));
  const add = () => onChange([...list, '']);
  const remove = (i: number) =>
    onChange(list.length <= 1 ? [''] : list.filter((_, k) => k !== i));

  return (
    <div className="space-y-2">
      {list.map((url, i) => (
        <div key={i} className="flex gap-2">
          <Input
            mono
            type="url"
            value={url}
            onChange={(e) => upd(i, e.target.value)}
            placeholder={i === 0 ? 'https://drive.google.com/…' : 'Bukti tambahan (URL)…'}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => remove(i)}
            disabled={list.length <= 1 && !list[0]}
            aria-label="Hapus bukti"
          >
            ×
          </Button>
        </div>
      ))}
      <Button type="button" variant="dashed" size="sm" onClick={add}>
        + Tambah bukti
      </Button>
    </div>
  );
}

/** Pecah daftar URL jadi { linkBukti (pertama), linkBuktiTambahan (sisanya) }. */
export function splitBukti(list: string[]): {
  linkBukti: string | null;
  linkBuktiTambahan: string[];
} {
  const clean = list.map((s) => s.trim()).filter(Boolean);
  return { linkBukti: clean[0] ?? null, linkBuktiTambahan: clean.slice(1) };
}

/** Gabung linkBukti utama + tambahan jadi satu daftar untuk editor. */
export function mergeBukti(
  linkBukti?: string | null,
  linkBuktiTambahan?: string[] | null,
): string[] {
  const list = [
    ...(linkBukti ? [linkBukti] : []),
    ...(linkBuktiTambahan ?? []),
  ];
  return list.length ? list : [''];
}
