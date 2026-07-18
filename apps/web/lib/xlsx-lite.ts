/**
 * Penulis .xlsx minimal murni-JS (tanpa dependensi) untuk export di browser.
 * Membangun OOXML SpreadsheetML + membungkusnya jadi ZIP "stored" (tanpa
 * kompresi) + CRC32. Cukup untuk laporan tabel sederhana; sel angka ditulis
 * sebagai number (bisa dijumlah/diurut di Excel), sisanya inline string.
 *
 * Dipakai halaman master untuk Export Excel yang menghormati filter aktif —
 * baris yang diekspor persis baris hasil filter di layar.
 */

export type Cell = string | number | null | undefined;

const enc = new TextEncoder();

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const escXml = (s: string) =>
  s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // buang kontrol char ilegal di XML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(headers: string[], rows: Cell[][]): string {
  const cell = (ref: string, v: Cell) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return `<c r="${ref}" t="n"><v>${v}</v></c>`;
    }
    const text = v == null ? '' : String(v);
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(text)}</t></is></c>`;
  };
  const rowXml = (cells: Cell[], r: number) =>
    `<row r="${r}">${cells.map((v, i) => cell(`${colName(i)}${r}`, v)).join('')}</row>`;

  const body = [rowXml(headers, 1), ...rows.map((r, i) => rowXml(r, i + 2))].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function sanitizeSheetName(name: string): string {
  return (name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
}

// ---- ZIP (stored) ----
interface ZipEntry { name: string; data: Uint8Array; crc: number; offset: number }

function pushU16(arr: number[], v: number) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
function pushU32(arr: number[], v: number) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const out: number[] = [];
  const entries: ZipEntry[] = [];
  const DATE = 0x21; // 1980-01-01
  const TIME = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const offset = out.length;
    // local file header
    pushU32(out, 0x04034b50);
    pushU16(out, 20);      // version needed
    pushU16(out, 0);       // flags
    pushU16(out, 0);       // method: stored
    pushU16(out, TIME);
    pushU16(out, DATE);
    pushU32(out, crc);
    pushU32(out, f.data.length); // compressed
    pushU32(out, f.data.length); // uncompressed
    pushU16(out, nameBytes.length);
    pushU16(out, 0);       // extra len
    for (const b of nameBytes) out.push(b);
    for (const b of f.data) out.push(b);
    entries.push({ name: f.name, data: f.data, crc, offset });
  }

  const cdStart = out.length;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    pushU32(out, 0x02014b50);
    pushU16(out, 20);      // version made by
    pushU16(out, 20);      // version needed
    pushU16(out, 0);       // flags
    pushU16(out, 0);       // method
    pushU16(out, TIME);
    pushU16(out, DATE);
    pushU32(out, e.crc);
    pushU32(out, e.data.length);
    pushU32(out, e.data.length);
    pushU16(out, nameBytes.length);
    pushU16(out, 0);       // extra
    pushU16(out, 0);       // comment
    pushU16(out, 0);       // disk number
    pushU16(out, 0);       // internal attrs
    pushU32(out, 0);       // external attrs
    pushU32(out, e.offset);
    for (const b of nameBytes) out.push(b);
  }
  const cdSize = out.length - cdStart;

  // end of central directory
  pushU32(out, 0x06054b50);
  pushU16(out, 0);
  pushU16(out, 0);
  pushU16(out, entries.length);
  pushU16(out, entries.length);
  pushU32(out, cdSize);
  pushU32(out, cdStart);
  pushU16(out, 0);

  return new Uint8Array(out);
}

/**
 * Bangun & unduh file .xlsx dari tabel (headers + rows). Nilai number ditulis
 * sebagai angka Excel; sisanya teks. Menghormati apa pun yang dikirim pemanggil
 * (mis. baris hasil filter aktif).
 */
export function exportRowsToXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Cell[][],
): void {
  const sheet = sheetXml(headers, rows);
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const files = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'xl/workbook.xml', data: enc.encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ];
  const zip = zipStore(files);
  const blob = new Blob([zip.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
