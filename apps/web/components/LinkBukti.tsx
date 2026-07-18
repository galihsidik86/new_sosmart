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

/**
 * Galeri bukti transaksi: gambar → thumbnail preview, PDF → kartu dokumen, link
 * eksternal → pill hostname. Semua bisa diklik (buka di tab baru). File bukti
 * yang di-upload disajikan via `/proxy/uploads/bukti/…` (ber-otentikasi,
 * same-origin → cookie sesi otomatis terkirim saat `<img>` memuat).
 *
 * Dirender inline (inline-flex) supaya aman di dalam `<p>`.
 */
export function LinkBuktiList({
  linkBukti,
  tambahan,
}: {
  linkBukti: string | null | undefined;
  tambahan?: string[] | null;
}) {
  const all = [
    ...(linkBukti ? [linkBukti] : []),
    ...(tambahan ?? []),
  ].filter(Boolean) as string[];
  if (all.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-top max-w-full">
      {all.map((url, i) => (
        <BuktiTile key={i} url={url} index={i} />
      ))}
    </span>
  );
}

function BuktiTile({ url, index }: { url: string; index: number }) {
  const clean = url.split('?')[0].toLowerCase();
  const isImage = /\.(png|jpe?g|webp|gif)$/.test(clean);
  const isPdf = clean.endsWith('.pdf');

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title="Buka gambar bukti"
        className="inline-block rounded-md border border-cream-300 overflow-hidden hover:border-sogan-400 hover:shadow-sm transition-colors duration-fast"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Bukti ${index + 1}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-16 w-16 object-cover block bg-cream-100"
        />
      </a>
    );
  }

  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title="Buka dokumen PDF bukti"
        className="inline-flex flex-col items-center justify-center gap-0.5 h-16 w-16 rounded-md border border-cream-300 bg-bata-50 text-bata-700 hover:border-sogan-400 transition-colors duration-fast"
      >
        <span className="text-xl" aria-hidden>📄</span>
        <span className="text-[10px] font-semibold">PDF</span>
      </a>
    );
  }

  let host = 'Link';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* biarkan 'Link' */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-cream-300 bg-cream-50 text-sogan-600 hover:text-sogan-700 hover:border-sogan-400 text-xs font-mono max-w-[200px] transition-colors duration-fast"
    >
      <span aria-hidden>🔗</span>
      <span className="truncate">{host}</span>
    </a>
  );
}
