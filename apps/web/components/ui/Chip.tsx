import type { ReactNode } from 'react';
import { cn } from './cn';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-cream-50 border-cream-300 text-tanah-700',
  brand: 'bg-sogan-50 border-sogan-300 text-sogan-700',
  success: 'bg-padi-100 border-padi-300 text-padi-700',
  danger: 'bg-bata-100 border-bata-300 text-bata-700',
  warning: 'bg-emas-100 border-emas-300 text-emas-700',
  info: 'bg-info-soft border-info text-info-700',
};

/** Chip kecil (periode, template, settlement, dsb). */
export function Chip({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
