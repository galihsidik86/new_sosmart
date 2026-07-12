'use client';

import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

/**
 * Aksi baris tabel yang responsif:
 * - 1 aksi (mis. cuma "Edit"): selalu tampil inline (kolom aksi di-pin
 *   sticky-kanan di mobile lewat `stickyEnd`, jadi tetap terjangkau).
 * - 2+ aksi: ≥640px tampil inline; <640px diringkas jadi tombol kebab (⋯) yang
 *   membuka menu lewat portal ke document.body (biar tidak terpotong `overflow`
 *   tabel).
 *
 * `children` = elemen aksi apa adanya (Link / <form><button>). Untuk mode kebab
 * dirender dua kali (inline desktop + menu mobile); form server-action aman
 * dirender ganda.
 */
export function RowActions({ children }: { children: ReactNode }) {
  const single = Children.toArray(children).length <= 1;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Satu aksi: cukup tampil inline di semua ukuran (sudah sticky-kanan di mobile).
  if (single) {
    return <div className="flex items-center justify-end gap-3">{children}</div>;
  }

  return (
    <>
      {/* Desktop: inline */}
      <div className="hidden sm:flex items-center justify-end gap-3">{children}</div>

      {/* Mobile: tombol kebab */}
      <button
        ref={btnRef}
        type="button"
        aria-label="Aksi baris"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-tanah-500 hover:bg-cream-100 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-400/60"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className={cn(
              'z-50 min-w-[9rem] flex flex-col gap-0.5 rounded-lg border border-cream-300 bg-white p-1 shadow-lg animate-lent-fade',
              '[&_a]:block [&_a]:w-full [&_a]:rounded-md [&_a]:px-3 [&_a]:py-2 [&_a]:text-sm [&_a]:font-semibold [&_a:hover]:bg-cream-100 [&_a:hover]:no-underline',
              '[&_button]:block [&_button]:w-full [&_button]:text-left [&_button]:rounded-md [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button]:font-semibold [&_button:hover]:bg-cream-100',
              '[&_form]:block [&_form]:w-full',
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
