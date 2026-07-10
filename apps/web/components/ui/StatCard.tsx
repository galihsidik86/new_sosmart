import type { ReactNode } from 'react';
import { cn } from './cn';
import { Money } from './Money';

type DeltaTone = 'up' | 'down' | 'neutral';
const DELTA: Record<DeltaTone, string> = {
  up: 'text-padi-500',
  down: 'text-bata-500',
  neutral: 'text-tanah-500',
};

interface StatCardProps {
  label: ReactNode;
  /** Angka utama; number/string diformat sebagai Rupiah serif. */
  value: number | string;
  withDecimal?: boolean;
  /** Tampilkan prefix "Rp". Default true. */
  prefix?: boolean;
  delta?: ReactNode;
  deltaTone?: DeltaTone;
  icon?: ReactNode;
  /** Kartu unggulan → invert sogan + batik. */
  featured?: boolean;
  className?: string;
}

/** Kartu KPI: label eyebrow + angka serif + delta. */
export function StatCard({
  label,
  value,
  withDecimal,
  prefix = true,
  delta,
  deltaTone = 'neutral',
  icon,
  featured,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm p-5',
        featured
          ? 'bg-sogan-500 border-sogan-600 text-cream-50 batik-overlay overflow-hidden'
          : 'bg-white border-cream-200',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'text-[11px] font-bold uppercase tracking-[0.07em]',
            featured ? 'text-cream-100' : 'text-tanah-500',
          )}
        >
          {label}
        </span>
        {icon && <span className={featured ? 'text-emas-300' : 'text-tanah-300'}>{icon}</span>}
      </div>
      <div className="mt-2">
        {featured ? (
          <span className="font-display text-2xl font-semibold tabular-nums text-cream-50">
            {prefix ? 'Rp ' : ''}
            {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
          </span>
        ) : (
          <Money value={value} withDecimal={withDecimal} prefix={prefix} className="text-2xl" />
        )}
      </div>
      {delta && (
        <div className={cn('mt-1 text-xs font-semibold', featured ? 'text-emas-300' : DELTA[deltaTone])}>
          {delta}
        </div>
      )}
    </div>
  );
}
