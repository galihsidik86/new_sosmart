import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from './cn';

/** Pembungkus tabel — kartu putih + overflow untuk radius rapi. */
export function Table({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto lentera-scroll">
        <table className={cn('w-full text-sm', className)}>{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-cream-50 text-left">
      <tr className="text-[11px] uppercase tracking-wider text-tanah-500">{children}</tr>
    </thead>
  );
}

interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}
export function TH({ numeric, className, children, ...rest }: THProps) {
  return (
    <th
      className={cn('px-4 py-3 font-bold', numeric && 'text-right', className)}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-cream-200">{children}</tbody>;
}

interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Nonaktifkan hover (mis. baris total). */
  noHover?: boolean;
}
export function TR({ noHover, className, children, ...rest }: TRProps) {
  return (
    <tr
      className={cn(!noHover && 'hover:bg-cream-50 transition-colors duration-fast', className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-2.5', className)} {...rest}>
      {children}
    </td>
  );
}

/** Sel angka dalam tabel — JetBrains Mono, rata kanan, tak terpotong. */
export function MoneyCell({
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap', className)}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Baris kosong (empty state di dalam tabel). */
export function EmptyRow({
  colSpan,
  children = 'Belum ada data.',
}: {
  colSpan: number;
  children?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-tanah-500">
        {children}
      </td>
    </tr>
  );
}
