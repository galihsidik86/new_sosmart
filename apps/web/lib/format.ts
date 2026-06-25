/**
 * Helper format id-ID untuk tampilan. Tidak menyentuh logika moneter.
 */
export const fmtRp = (v: string | number, withDecimal = false): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return (
    'Rp ' +
    new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: withDecimal ? 2 : 0,
      maximumFractionDigits: withDecimal ? 2 : 0,
    }).format(n)
  );
};

export const fmtPlain = (v: string | number, withDecimal = false): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: withDecimal ? 2 : 0,
    maximumFractionDigits: withDecimal ? 2 : 0,
  }).format(n);
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
