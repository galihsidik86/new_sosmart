'use client';

import { useState } from 'react';
import { Button, Input } from './ui';

/**
 * Editor daftar tautan dokumen untuk dipakai DI DALAM form server-action.
 * Merender N input ber-`name` sama → server action baca lewat
 * `formData.getAll(name)` lalu buang yang kosong.
 */
export function DokumenLinksInput({
  name = 'linkDokumen',
  initial = [],
}: {
  name?: string;
  initial?: string[];
}) {
  const [list, setList] = useState<string[]>(initial.length ? initial : ['']);
  const upd = (i: number, v: string) => setList((l) => l.map((x, k) => (k === i ? v : x)));
  const add = () => setList((l) => [...l, '']);
  const remove = (i: number) =>
    setList((l) => (l.length <= 1 ? [''] : l.filter((_, k) => k !== i)));

  return (
    <div className="space-y-2">
      {list.map((url, i) => (
        <div key={i} className="flex gap-2">
          <Input
            name={name}
            mono
            type="url"
            value={url}
            onChange={(e) => upd(i, e.target.value)}
            placeholder="https://drive.google.com/…"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => remove(i)}
            aria-label="Hapus tautan"
          >
            ×
          </Button>
        </div>
      ))}
      <Button type="button" variant="dashed" size="sm" onClick={add}>
        + Tambah tautan
      </Button>
    </div>
  );
}
