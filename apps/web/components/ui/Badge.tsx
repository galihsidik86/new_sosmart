import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'neutral'
  | 'brand';

const VARIANTS: Record<BadgeVariant, string> = {
  success: 'bg-padi-100 text-padi-700',
  warning: 'bg-emas-100 text-emas-700',
  info: 'bg-info-soft text-info-700',
  danger: 'bg-bata-100 text-bata-700',
  neutral: 'bg-cream-200 text-tanah-500',
  brand: 'bg-sogan-50 text-sogan-500',
};

type Size = 'sm' | 'md';
const SIZES: Record<Size, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-3 py-1',
};

export function Badge({
  variant = 'neutral',
  size = 'sm',
  className,
  children,
}: {
  variant?: BadgeVariant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-bold uppercase tracking-wider rounded-full whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Peta status dokumen (faktur/jurnal) → varian badge. */
export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'POSTED':
    case 'PAID':
    case 'LUNAS':
    case 'APPROVED':
      return 'success';
    case 'DRAFT':
    case 'PARTIAL':
    case 'MENUNGGU':
      return 'warning';
    case 'SENT':
    case 'TERKIRIM':
      return 'info';
    case 'CANCELLED':
    case 'REVERSED':
    case 'DIBATALKAN':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Badge status dokumen siap pakai. */
export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: Size;
}) {
  const struck = status === 'CANCELLED' || status === 'REVERSED';
  return (
    <Badge variant={statusVariant(status)} size={size} className={struck ? 'line-through' : undefined}>
      {status}
    </Badge>
  );
}
