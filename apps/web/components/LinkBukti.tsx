/**
 * Renderer link bukti transaksi eksternal.
 *
 * Untuk kolom "Bukti" di list transaksi → pakai `variant="icon"` (kompak, ikon 📎).
 * Untuk header detail → pakai `variant="full"` (link URL lengkap, terbuka di tab
 * baru dengan `rel=noreferrer noopener` supaya tidak leak referrer).
 */
export function LinkBukti({
  url,
  variant = 'icon',
  emptyLabel = '—',
}: {
  url: string | null | undefined;
  variant?: 'icon' | 'full';
  emptyLabel?: string;
}) {
  if (!url) return <span className="text-tanah-300">{emptyLabel}</span>;
  if (variant === 'icon') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title={url}
        aria-label="Buka bukti transaksi"
        className="inline-flex items-center justify-center w-6 h-6 rounded bg-sogan-50 hover:bg-sogan-100 text-sogan-500 hover:text-sogan-700"
      >
        <span aria-hidden>🔗</span>
      </a>
    );
  }
  // 'full'
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-sogan-500 hover:text-sogan-700 hover:underline break-all font-mono text-xs"
    >
      🔗 {url}
    </a>
  );
}
