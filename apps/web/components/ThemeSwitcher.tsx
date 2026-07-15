'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './ui/cn';

interface ThemeOpt {
  id: string;
  name: string;
  swatch: string; // warna aksen (sogan-500) untuk preview
}

const THEMES: ThemeOpt[] = [
  { id: 'sogan', name: 'Sogan (maroon)', swatch: '#8B2E2E' },
  { id: 'biru', name: 'Biru Laut', swatch: '#2A6FA8' },
  { id: 'hijau', name: 'Hijau Padi', swatch: '#4A7C3A' },
  { id: 'emas', name: 'Emas', swatch: '#966A1E' },
  { id: 'ungu', name: 'Ungu', swatch: '#6D34A0' },
];

const STORAGE_KEY = 'lentera-theme';

function applyTheme(id: string) {
  const root = document.documentElement;
  if (id === 'sogan') root.removeAttribute('data-theme');
  else root.dataset.theme = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

/** Pemilih tema warna aksen. Tersimpan per-perangkat (localStorage). */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('sogan');
  const ref = useRef<HTMLDivElement>(null);

  // Sinkron dari yang sudah diterapkan skrip init (dataset) saat mount.
  useEffect(() => {
    const t = document.documentElement.dataset.theme || 'sogan';
    setCurrent(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ganti tema tampilan"
        title="Tema tampilan"
        className="w-9 h-9 grid place-items-center rounded-full hover:bg-cream-200/60 transition-colors"
      >
        <span className="w-4 h-4 rounded-full ring-2 ring-white shadow-sm bg-sogan-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-cream-200 rounded-xl shadow-lg overflow-hidden animate-lent-fade z-30">
          <div className="px-4 py-2.5 border-b border-cream-200 text-xs font-bold uppercase tracking-wider text-tanah-500">
            Tema Tampilan
          </div>
          <ul className="py-1">
            {THEMES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pick(t.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-cream-50',
                    current === t.id ? 'text-tanah-700 font-semibold' : 'text-tanah-600',
                  )}
                >
                  <span
                    className="w-4 h-4 rounded-full ring-1 ring-black/10 shrink-0"
                    style={{ backgroundColor: t.swatch }}
                  />
                  {t.name}
                  {current === t.id && <span className="ml-auto text-sogan-500">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
