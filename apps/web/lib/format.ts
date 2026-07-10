/**
 * Helper format id-ID untuk tampilan. Tidak menyentuh logika moneter.
 */
// Rupiah bulat; desimal hanya bila ada sen (mis. 316.250.000,04). withDecimal=true → paksa 2.
const decDigits = (n: number, withDecimal: boolean): number =>
  withDecimal || Math.round(Math.abs(n) * 100) % 100 !== 0 ? 2 : 0;

export const fmtRp = (v: string | number, withDecimal = false): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  const d = decDigits(n, withDecimal);
  return 'Rp ' + new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: 2 }).format(n);
};

export const fmtPlain = (v: string | number, withDecimal = false): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  const d = decDigits(n, withDecimal);
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: 2 }).format(n);
};

export const fmtTanggal = (iso: string | Date): string => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

export const fmtNpwp = (s: string | null | undefined): string => {
  if (!s) return '—';
  const digits = s.replace(/\D/g, '');
  if (digits.length === 16) {
    // NIK (era Coretax)
    return digits.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4');
  }
  if (digits.length === 15) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{1})(\d{3})(\d{3})/,
      '$1.$2.$3.$4-$5.$6',
    );
  }
  return s;
};
