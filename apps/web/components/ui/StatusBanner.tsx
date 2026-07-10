import type { ReactNode } from 'react';
import { cn } from './cn';

export type BannerTone = 'success' | 'danger' | 'neutral' | 'info' | 'warning';

const TONES: Record<BannerTone, string> = {
  success: 'bg-padi-100 text-padi-700',
  danger: 'bg-bata-100 text-bata-700',
  neutral: 'bg-cream-50 text-tanah-500',
  info: 'bg-info-soft text-info-700',
  warning: 'bg-emas-100 text-emas-700',
};

/**
 * Banner status inline (mis. saldo debit=kredit seimbang / tidak).
 * Menggantikan pola balance-banner yang di-copy di JurnalForm/CashBankForm/OpnameForm.
 */
export function StatusBanner({
  tone = 'neutral',
  icon,
  children,
  right,
  className,
}: {
  tone?: BannerTone;
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3',
        TONES[tone],
        className,
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {children}
      </span>
      {right}
    </div>
  );
}
