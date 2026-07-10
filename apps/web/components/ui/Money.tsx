import type { CSSProperties } from 'react';
import { fmtRp, fmtPlain } from '@/lib/format';
import { cn } from './cn';

const displayVariation: CSSProperties = {
  fontVariationSettings: '"opsz" 48, "SOFT" 30',
};

/**
 * Angka HEADLINE (KPI, total, grand-total) — serif Fraunces + tabular.
 * Ini bagian dari sistem angka dua-tingkat Sembada:
 *  - Money (serif)  → angka besar / total
 *  - <MoneyCell>    → angka di dalam tabel (JetBrains Mono)
 */
export function Money({
  value,
  withDecimal,
  prefix = true,
  className,
}: {
  value: number | string;
  withDecimal?: boolean;
  /** Tampilkan "Rp". Default true. */
  prefix?: boolean;
  className?: string;
}) {
  const text = prefix ? fmtRp(value, withDecimal) : fmtPlain(value, withDecimal);
  return (
    <span
      className={cn('font-display font-semibold tabular-nums text-wedel-900 tracking-tight', className)}
      style={displayVariation}
    >
      {text}
    </span>
  );
}
