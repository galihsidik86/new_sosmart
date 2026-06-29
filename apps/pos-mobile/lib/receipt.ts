/**
 * Bangun struk thermal dari data transaksi.
 * Input minimal: header (tenant/cabang), lines, total, footer (kasir, tanggal).
 */
import { EscPos, type PaperWidth } from './escpos';
import { fmtRp, fmtDateShort } from './format';
import type { CartLine } from './cart';

export interface ReceiptInput {
  paper?: PaperWidth;
  header: {
    tenantNama: string;
    cabangKode: string;
    cabangNama: string;
    cabangAlamat?: string;
  };
  nomor: string | null;
  tanggal: Date;
  kasirNama: string;
  customerNama?: string;
  lines: CartLine[];
  subtotal: number;
  diskon: number;
  ppn: number;
  total: number;
  bayar: number;
  kembalian: number;
  footer?: string;
}

export function buildReceipt(input: ReceiptInput): Uint8Array {
  const e = new EscPos(input.paper ?? '58mm');

  e.init().center().bold().size(0x10).line(input.header.tenantNama).bold(false).size(0x00);
  e.line(`${input.header.cabangKode} · ${input.header.cabangNama}`);
  if (input.header.cabangAlamat) e.line(input.header.cabangAlamat);

  e.rule('=').left();
  e.row('No', input.nomor ?? '— DRAFT —');
  e.row('Tgl', fmtDateShort(input.tanggal));
  e.row('Kasir', input.kasirNama);
  if (input.customerNama) e.row('Customer', input.customerNama);
  e.rule('-');

  for (const l of input.lines) {
    e.line(l.nama.length > e.width ? l.nama.slice(0, e.width) : l.nama);
    const left = `  ${l.qty} ${l.satuan} x ${fmtRp(l.hargaSatuan)}`;
    const right = fmtRp(l.qty * l.hargaSatuan);
    e.row(left, right);
    if (l.diskonPersen > 0) {
      e.row(`  disk ${l.diskonPersen}%`, `-${fmtRp((l.qty * l.hargaSatuan * l.diskonPersen) / 100)}`);
    }
  }

  e.rule('-');
  e.row('Subtotal', fmtRp(input.subtotal));
  if (input.diskon > 0) e.row('Diskon', `-${fmtRp(input.diskon)}`);
  if (input.ppn > 0) e.row('PPN', fmtRp(input.ppn));
  e.bold().size(0x10).row('TOTAL', fmtRp(input.total)).size(0x00).bold(false);
  e.rule('-');
  e.row('Bayar', fmtRp(input.bayar));
  e.row('Kembali', fmtRp(input.kembalian));
  e.rule('=');

  e.center();
  e.line(input.footer ?? 'Terima kasih atas kunjungan Anda');
  e.line('powered by Lentera POS');
  e.feed(3).cut();

  return e.build();
}

/**
 * Versi test print sederhana — pakai untuk verifikasi koneksi/cetakan.
 */
export function testReceipt(paper: PaperWidth = '58mm'): Uint8Array {
  const e = new EscPos(paper);
  e.init().center().bold().size(0x30).line('LENTERA').size(0x10).line('POS Test').size(0x00).bold(false);
  e.rule('=').left();
  e.line('Ini test print thermal printer.');
  e.line(`Lebar ${paper} · ${e.width} karakter.`);
  e.line(fmtDateShort(new Date()));
  e.rule('=');
  e.center().line('OK ✓');
  e.feed(3).cut();
  return e.build();
}
