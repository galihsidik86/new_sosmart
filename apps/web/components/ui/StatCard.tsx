import type { CSSProperties, ReactNode } from 'react';
import { fmtRp } from '@/lib/format';
import { cn } from './cn';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'muted';
const TONE: Record<Tone, string> = {
  default: 'text-wedel-900',
  success: 'text-padi-700',
  danger: 'text-bata-700',
  warning: 'text-emas-700',
  muted: 'text-tanah-700',
};

const displayVariation: CSSProperties = { fontVariationSettings: '"opsz" 48, "SOFT" 30' };

interface StatCardProps {
  label: ReactNode;
  /** number → diformat Rupiah; string → tampil apa adanya. */
  value: number | string;
  /** Warna angka utama. */
  tone?: Tone;
  delta?: ReactNode;
  deltaTone?: 'up' | 'down' | 'neutral';
  icon?: ReactNode;
  /** Kartu unggulan → invert sogan + batik. */
  featured?: boolean;
  className?: string;
}

const DELTA: Record<NonNullable<StatCardProps['deltaTone']>, string> = {
  up: 'text-padi-500',
  down: 'text-bata-500',
  neutral: 'text-tanah-500',
};

/** Kartu KPI: label eyebrow + angka serif (Fraunces) + delta opsional. */
export function StatCard({
  label,
  value,
  tone = 'default',
  delta,
  deltaTone = 'neutral',
  icon,
  featured,
  className,
}: StatCardProps) {
  const text = typeof value === 'number' ? fmtRp(value) : value;
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
      <div
        className={cn(
          'mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight',
          featured ? 'text-cream-50' : TONE[tone],
        )}
        style={displayVariation}
      >
        {text}
      </div>
      {delta && (
        <div className={cn('mt-1 text-xs font-semibold', featured ? 'text-emas-300' : DELTA[deltaTone])}>
          {delta}
        </div>
      )}
    </div>
  );
}
