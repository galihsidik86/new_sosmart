import type { ReactNode } from 'react';
import { cn } from './cn';

type Size = 'list' | 'report' | 'form' | 'wide';
const MAXW: Record<Size, string> = {
  list: 'max-w-7xl',
  form: 'max-w-6xl',
  report: 'max-w-3xl', // ~760px, laporan keuangan
  wide: 'max-w-none',
};

/**
 * Pembungkus konten halaman: lebar & padding konsisten + animasi masuk.
 * Ganti pola `px-8 py-6 max-w-* mx-auto w-full` yang selama ini di-hardcode
 * berbeda-beda per halaman.
 */
export function PageContainer({
  size = 'list',
  className,
  children,
}: {
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-4 sm:px-6 lg:px-8 py-6 mx-auto w-full animate-lent-fade',
        MAXW[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
