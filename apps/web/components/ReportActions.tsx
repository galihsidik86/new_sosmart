import { buttonClass } from './ui';

/**
 * Aksi ekspor standar laporan: Export Excel (padi) + Preview PDF (bata).
 * Menyeragamkan tombol yang selama ini di-copy inline di tiap halaman laporan.
 */
export function ReportActions({ xlsx, pdf }: { xlsx?: string; pdf?: string }) {
  if (!xlsx && !pdf) return null;
  return (
    <>
      {xlsx && (
        <a href={xlsx} className={buttonClass('success')}>
          Export Excel
        </a>
      )}
      {pdf && (
        <a href={pdf} target="_blank" rel="noopener noreferrer" className={buttonClass('soft-bata')}>
          Preview PDF
        </a>
      )}
    </>
  );
}
