/**
 * Bangun href list/laporan sambil mempertahankan filter yang sedang aktif.
 * Nilai kosong/undefined dibuang supaya URL bersih.
 */
export function buildListHref(
  base: string,
  current: Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {},
): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
