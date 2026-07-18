'use client';

import { Button } from '@/components/ui';
import { fmtNpwp, fmtRp } from '@/lib/format';

interface CustomerRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  jenisPelanggan: { id: string; nama: string } | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
  isAktif: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function CustomerReportButton({
  customers,
  orgName,
  search,
  jenisNama,
}: {
  customers: CustomerRow[];
  orgName: string;
  search?: string;
  jenisNama?: string;
}) {
  function cetak() {
    const kriteria: string[] = [];
    if (search) kriteria.push(`Pencarian: "${esc(search)}"`);
    if (jenisNama) kriteria.push(`Jenis pelanggan: ${esc(jenisNama)}`);
    if (kriteria.length === 0) kriteria.push('Semua pelanggan');

    const now = new Date();
    const cetakTs = now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    const totalLimit = customers.reduce((a, c) => a + Number(c.kreditLimit ?? 0), 0);

    const rowsHtml = customers
      .map((c, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td class="mono">${esc(c.kode)}</td>
        <td><b>${esc(c.nama)}</b></td>
        <td>${esc(c.jenisPelanggan?.nama ?? '—')}</td>
        <td class="c">${c.isPkp ? 'PKP' : '—'}</td>
        <td class="mono">${esc(fmtNpwp(c.npwp))}</td>
        <td>${esc(c.kota ?? '—')}</td>
        <td>${esc(c.telp ?? '—')}</td>
        <td class="c">${c.terminHari} hari</td>
        <td class="r">${fmtRp(c.kreditLimit)}</td>
      </tr>`)
      .join('');

    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Laporan Daftar Pelanggan</title>
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
  td.c { text-align: center; } td.r { text-align: right; } td.mono, .mono { font-family: ui-monospace, Consolas, monospace; }
  tfoot td { font-weight: 700; background: #f7f1e6; }
  .foot { margin-top: 16px; color: #93826a; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="org">${esc(orgName)}</div>
    <h1>Laporan Daftar Pelanggan</h1>
    <div class="meta">Dicetak: ${cetakTs} · ${customers.length} pelanggan</div>
  </div>
  <div class="krit"><b>Kriteria:</b> ${kriteria.map(esc).join(' &nbsp;•&nbsp; ')}</div>
  <table>
    <thead><tr>
      <th>No</th><th>Kode</th><th>Nama</th><th>Jenis</th><th>PKP</th>
      <th>NPWP</th><th>Kota</th><th>Telp</th><th>Termin</th><th>Limit Kredit</th>
    </tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="10" style="text-align:center;padding:18px;color:#93826a">Tidak ada pelanggan sesuai kriteria.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="9" class="r">Total Limit Kredit (${customers.length} pelanggan)</td>
      <td class="r">${fmtRp(String(totalLimit))}</td>
    </tr></tfoot>
  </table>
  <div class="foot"><span>Lentera · Sistem Akuntansi &amp; Pajak</span><span>Halaman laporan internal</span></div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <Button variant="soft-sogan" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>
      Cetak Laporan
    </Button>
  );
}
