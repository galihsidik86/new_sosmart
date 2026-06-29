/**
 * Encoder ESC/POS byte sequence untuk printer thermal 58mm / 80mm.
 * Cara pakai: bangun bytes lewat helper di sini, lalu kirim via printer.write().
 *
 * Asumsi printer:
 *  - Charset CP437 / default ASCII (kalau perlu UTF-8 ID, pakai code page selector)
 *  - Lebar 32 karakter (58mm) atau 48 karakter (80mm)
 *
 * Referensi commands: ESC/POS Application Programming Guide (Epson).
 */

export const PAPER_WIDTH = {
  '58mm': 32,
  '80mm': 48,
} as const;
export type PaperWidth = keyof typeof PAPER_WIDTH;

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ESC = 0x1b;
const GS = 0x1d;

export const cmd = {
  init: () => new Uint8Array([ESC, 0x40]),
  alignLeft: () => new Uint8Array([ESC, 0x61, 0]),
  alignCenter: () => new Uint8Array([ESC, 0x61, 1]),
  alignRight: () => new Uint8Array([ESC, 0x61, 2]),
  boldOn: () => new Uint8Array([ESC, 0x45, 1]),
  boldOff: () => new Uint8Array([ESC, 0x45, 0]),
  /** Mode print:  0x10 double height, 0x20 double width, 0x30 both, 0x00 normal */
  textSize: (mode: 0x00 | 0x10 | 0x20 | 0x30) => new Uint8Array([ESC, 0x21, mode]),
  feed: (lines = 1) => new Uint8Array([ESC, 0x64, lines]),
  cut: () => new Uint8Array([GS, 0x56, 0]),
  partialCut: () => new Uint8Array([GS, 0x56, 1]),
  text: (s: string) => enc.encode(s),
  newline: () => new Uint8Array([0x0a]),
} as const;

/**
 * Builder fluent untuk merangkai sequence ESC/POS dengan readable code.
 *   const data = new EscPos('58mm').init().center().bold().text('LENTERA POS').newline().build();
 */
export class EscPos {
  private parts: Uint8Array[] = [];
  readonly width: number;

  constructor(public paper: PaperWidth = '58mm') {
    this.width = PAPER_WIDTH[paper];
  }

  private push(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }

  init(): this { return this.push(cmd.init()); }
  left(): this { return this.push(cmd.alignLeft()); }
  center(): this { return this.push(cmd.alignCenter()); }
  right(): this { return this.push(cmd.alignRight()); }
  bold(on = true): this { return this.push(on ? cmd.boldOn() : cmd.boldOff()); }
  size(mode: 0x00 | 0x10 | 0x20 | 0x30 = 0x00): this { return this.push(cmd.textSize(mode)); }
  feed(n = 1): this { return this.push(cmd.feed(n)); }
  cut(): this { return this.push(cmd.cut()); }
  partialCut(): this { return this.push(cmd.partialCut()); }
  newline(n = 1): this {
    for (let i = 0; i < n; i++) this.push(cmd.newline());
    return this;
  }
  text(s: string): this { return this.push(cmd.text(s)); }
  line(s = ''): this { return this.text(s).newline(); }

  /** Garis horizontal isi karakter `ch` selebar paper. */
  rule(ch = '-'): this { return this.line(ch.repeat(this.width)); }

  /** Dua kolom kiri-kanan dalam satu baris. Auto-pad pakai spasi. */
  row(left: string, right: string): this {
    const max = this.width;
    if (left.length + right.length + 1 > max) {
      // Potong kiri kalau kepanjangan
      left = left.slice(0, max - right.length - 1);
    }
    const pad = max - left.length - right.length;
    return this.line(left + ' '.repeat(Math.max(1, pad)) + right);
  }

  build(): Uint8Array {
    return concat(...this.parts);
  }
}
