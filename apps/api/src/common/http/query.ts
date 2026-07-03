/**
 * Parse projectId query param:
 *   - undefined atau '' → semua (tidak filter)
 *   - 'none' → hanya baris tanpa project (overhead)
 *   - UUID → project spesifik
 */
export function normalizeProjectFilter(v?: string): string | null | undefined {
  if (v === undefined || v === '') return undefined;
  if (v === 'none') return null;
  return v;
}
