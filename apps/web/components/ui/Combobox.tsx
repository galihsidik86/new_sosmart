'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface ComboOption {
  value: string;
  label: string;
  /** Baris kedua kecil (mis. nama akun di bawah kode). */
  sublabel?: string;
  /** Teks tambahan yang ikut dicari tapi tak ditampilkan. */
  keywords?: string;
}

/**
 * Dropdown dengan pencarian (combobox/typeahead) — pengganti `<select>` untuk
 * daftar panjang (COA, pelanggan, vendor, item). Controlled: `value`/`onChange`.
 * Ketik untuk memfilter, panah ↑/↓ + Enter untuk memilih, Esc menutup.
 *
 * Panel dropdown dirender via portal dengan posisi `fixed` supaya tidak
 * terpotong di dalam kontainer `overflow-*` (mis. tabel baris yang bisa
 * di-scroll horizontal). Isi `name` untuk `<form>` berbasis FormData.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = '— pilih —',
  emptyText = 'Tidak ada hasil',
  disabled = false,
  required = false,
  invalid = false,
  mono = false,
  size = 'md',
  name,
  className,
  buttonClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  mono?: boolean;
  size?: 'sm' | 'md';
  name?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.sublabel ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  const measure = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) close();
    };
    const onMove = () => measure();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    measure();
    setOpen(true);
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (o: ComboOption) => {
    onChange(o.value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const panel = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: Math.max(coords.width, 240) }}
          className="z-50 bg-white border border-cream-300 rounded-md shadow-lg flex flex-col max-h-72 overflow-hidden"
        >
          <div className="p-1.5 border-b border-cream-200">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Ketik untuk mencari…"
              className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded text-sm focus:outline-none focus:border-sogan-500"
            />
          </div>
          <ul ref={listRef} role="listbox" className="overflow-y-auto lentera-scroll py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-tanah-500">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'px-3 py-1.5 text-sm cursor-pointer',
                  i === active && 'bg-sogan-50',
                  o.value === value ? 'text-sogan-700 font-semibold' : 'text-tanah-700',
                )}
              >
                <span className={mono ? 'font-mono' : undefined}>{o.label}</span>
                {o.sublabel && <span className="block text-[11px] text-tanah-500 font-normal">{o.sublabel}</span>}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn('relative', className)}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-2 bg-cream-50 border rounded-md text-left',
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-2 text-sm',
          'focus-visible:outline-none focus-visible:border-sogan-500',
          invalid ? 'border-bata-500' : 'border-cream-300',
          disabled && 'opacity-60 cursor-not-allowed',
          buttonClassName,
        )}
      >
        <span className={cn('truncate', mono && 'font-mono', selected ? 'text-tanah-700' : 'text-tanah-400')}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-tanah-400 shrink-0 text-xs" aria-hidden>▾</span>
      </button>
      {panel}
    </div>
  );
}
