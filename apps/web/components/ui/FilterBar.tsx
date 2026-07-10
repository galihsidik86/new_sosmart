import type { ReactNode } from 'react';
import { cn } from './cn';

/** Toolbar filter/aksi di atas tabel — chrome kartu konsisten. */
export function FilterBar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white border border-cream-200 rounded-xl p-3 mb-6 shadow-sm text-sm',
        'flex items-center gap-3 flex-wrap',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Label kecil di dalam FilterBar (eyebrow). */
export function FilterLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-wider text-tanah-500 font-bold">
      {children}
    </span>
  );
}
