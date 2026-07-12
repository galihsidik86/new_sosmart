'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Segmented control (track cream, segmen aktif putih + shadow) — sesuai spec
 * Sembada untuk toggle seperti Barang/Jasa.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex p-1 bg-cream-200 rounded-lg gap-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sogan-400/60',
              active
                ? 'bg-white text-sogan-500 shadow-xs'
                : 'text-tanah-500 hover:text-tanah-700',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
