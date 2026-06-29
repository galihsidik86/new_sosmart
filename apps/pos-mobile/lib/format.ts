const rp = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});
const plain = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

export const fmtRp = (n: number | string) =>
  rp.format(typeof n === 'string' ? Number(n) : n);

export const fmtPlain = (n: number | string) =>
  plain.format(typeof n === 'string' ? Number(n) : n);

export const fmtDateShort = (d: string | Date) => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
