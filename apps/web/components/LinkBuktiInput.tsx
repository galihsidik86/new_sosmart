'use client';

import { useRef, useState } from 'react';
import { Button, Input } from './ui';

/**
 * Editor multi-bukti transaksi. Mendukung dua sumber:
 *  1. Link URL (Google Drive dsb.) — input yang bisa ditambah/dihapus.
 *  2. Upload file (PDF/gambar, bisa beberapa sekaligus) — di-upload ke
 *     `/api/bukti`, URL hasilnya masuk ke daftar sebagai lampiran.
 * Bukti pertama disimpan sebagai `linkBukti` utama, sisanya `linkBuktiTambahan`
 * (lihat splitBukti / mergeBukti).
 */
export function LinkBuktiInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const list = value.length ? value : [''];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upd = (i: number, v: string) => onChange(list.map((x, k) => (k === i ? v : x)));
  const add = () => onChange([...list, '']);
  const remove = (i: number) =>
    onChange(list.length <= 1 ? [''] : list.filter((_, k) => k !== i));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('file', f));
      const res = await fetch('/bukti-upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Upload gagal (${res.status})`);
      }
      const { files: uploaded } = (await res.json()) as { files: Array<{ name: string; url: string }> };
      const abs = uploaded.map((f) => (f.url.startsWith('http') ? f.url : window.location.origin + f.url));
      onChange([...list.filter(Boolean), ...abs]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const fileLabel = (url: string) => {
    const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
    return ext === 'pdf' ? 'Dokumen PDF' : `Gambar (${ext || 'file'})`;
  };

  return (
    <div className="space-y-2">
      {list.map((url, i) => {
        const isFile = url.includes('/uploads/bukti/');
        return (
          <div key={i} className="flex gap-2 items-center">
            {isFile ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center gap-2 px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm text-sogan-700 hover:bg-cream-100 truncate"
                title={url}
              >
                <span aria-hidden>📎</span>
                <span className="truncate">{fileLabel(url)}</span>
              </a>
            ) : (
              <Input
                mono
                type="url"
                value={url}
                onChange={(e) => upd(i, e.target.value)}
                placeholder={i === 0 ? 'https://drive.google.com/…' : 'Bukti tambahan (URL)…'}
              />
            )}
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
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="dashed" size="sm" onClick={add}>
          + Link bukti
        </Button>
        <Button
          type="button"
          variant="dashed"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Mengunggah…' : '📎 Upload file'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="text-[11px] text-tanah-500">PDF/gambar, bisa beberapa, maks 10 MB/file</span>
      </div>
      {err && <p className="text-xs text-bata-700">{err}</p>}
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
