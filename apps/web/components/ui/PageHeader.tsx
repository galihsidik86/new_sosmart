import type { ReactNode } from 'react';
import { cn } from './cn';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Header halaman standar: eyebrow + judul (Fraunces) + subjudul + aksi. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sogan-500 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl font-semibold text-wedel-900 leading-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-tanah-500 mt-1">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
