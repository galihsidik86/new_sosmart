/**
 * Helper cetak laporan daftar (master data) — membuka jendela cetak berisi
 * kop perusahaan, ringkasan kriteria aktif, tabel, dan (opsional) baris total.
 * Dipakai halaman list gaya "project" (Pelanggan/Vendor/Barang/Karyawan).
 */

export interface PrintColumn {
  header: string;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  bold?: boolean;
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const alignCls = (a?: 'left' | 'center' | 'right') => (a === 'right' ? 'r' : a === 'center' ? 'c' : '');

export function openPrintReport(opts: {
  title: string;
  orgName: string;
  countLabel: string;
  count: number;
  criteria: string[];
  columns: PrintColumn[];
  rows: string[][];
  footer?: { label: string; value: string };
}): void {
  const { title, orgName, countLabel, count, criteria, columns, rows, footer } = opts;
  const now = new Date();
  const ts = now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

  const thead = columns
    .map((c) => {
      const cls = alignCls(c.align);
      return `<th${cls ? ` class="${cls}"` : ''}>${esc(c.header)}</th>`;
    })
    .join('');

  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<tr>${r
              .map((cell, i) => {
                const c = columns[i];
                const cls = [alignCls(c?.align), c?.mono ? 'mono' : ''].filter(Boolean).join(' ');
                const val = c?.bold ? `<b>${esc(cell)}</b>` : esc(cell);
                return `<td${cls ? ` class="${cls}"` : ''}>${val}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length}" style="text-align:center;padding:18px;color:#93826a">Tidak ada data sesuai kriteria.</td></tr>`;

  const tfoot = footer
    ? `<tfoot><tr><td colspan="${columns.length - 1}" class="r">${esc(footer.label)}</td><td class="r">${esc(footer.value)}</td></tr></tfoot>`
    : '';

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #2a2118; margin: 28px; font-size: 12px; }
  .head { border-bottom: 2px solid #a4632a; padding-bottom: 10px; margin-bottom: 14px; }
  .org { font-size: 15px; font-weight: 700; color: #834d1f; }
  h1 { font-size: 18px; margin: 2px 0 4px; }
  .meta { color: #6b5842; font-size: 11px; }
  .krit { margin: 10px 0 14px; padding: 8px 12px; background: #f7f1e6; border: 1px solid #e3d6bf; border-radius: 6px; font-size: 11px; color: #4a3a2a; }
  .krit b { color: #834d1f; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d8cbb2; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #efe6d5; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  th.c, td.c { text-align: center; } th.r, td.r { text-align: right; } td.mono, .mono { font-family: ui-monospace, Consolas, monospace; }
  tfoot td { font-weight: 700; background: #f7f1e6; }
  .foot { margin-top: 16px; color: #93826a; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="org">${esc(orgName)}</div>
    <h1>${esc(title)}</h1>
    <div class="meta">Dicetak: ${ts} · ${count} ${esc(countLabel)}</div>
  </div>
  <div class="krit"><b>Kriteria:</b> ${criteria.map(esc).join(' &nbsp;•&nbsp; ')}</div>
  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>${body}</tbody>
    ${tfoot}
  </table>
  <div class="foot"><span>Lentera · Sistem Akuntansi &amp; Pajak</span><span>Halaman laporan internal</span></div>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
}
