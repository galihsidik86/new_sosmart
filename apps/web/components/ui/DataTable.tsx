import type { ReactNode } from 'react';
import { Table, THead, TH, TBody, TR, TD, EmptyRow } from './Table';
import { cn } from './cn';

export interface Column<T> {
  /** Kunci unik kolom. */
  key: string;
  header: ReactNode;
  /** 'right' → rata kanan; 'center' → tengah; default kiri. */
  align?: 'left' | 'right' | 'center';
  /** Sel angka: rata kanan + JetBrains Mono + tabular-nums. */
  numeric?: boolean;
  /** className lebar/tambahan untuk header + sel. */
  width?: string;
  className?: string;
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * Tabel deklaratif di atas primitives Table. Definisikan kolom (header,
 * alignment, sel), berikan baris — konsisten & anti-drift untuk halaman list.
 */
export function DataTable<T>({ columns, rows, getRowKey, empty, rowClassName }: DataTableProps<T>) {
  const align = (c: Column<T>) =>
    cn(
      c.numeric && 'text-right font-mono tabular-nums whitespace-nowrap',
      !c.numeric && c.align === 'right' && 'text-right',
      c.align === 'center' && 'text-center',
    );

  return (
    <Table>
      <THead>
        {columns.map((c) => (
          <TH key={c.key} numeric={c.align === 'right' || c.numeric} className={cn(c.width, c.align === 'center' && 'text-center')}>
            {c.header}
          </TH>
        ))}
      </THead>
      <TBody>
        {rows.map((row, i) => (
          <TR key={getRowKey(row, i)} className={rowClassName?.(row)}>
            {columns.map((c) => (
              <TD key={c.key} className={cn(align(c), c.className)}>
                {c.cell(row)}
              </TD>
            ))}
          </TR>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={columns.length}>{empty ?? 'Belum ada data.'}</EmptyRow>}
      </TBody>
    </Table>
  );
}
