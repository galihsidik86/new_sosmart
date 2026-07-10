/**
 * cn — penggabung className minimalis tanpa dependency.
 * Menerima string / falsy; falsy diabaikan. (Bukan pengganti tailwind-merge:
 * tidak melakukan dedup konflik, cukup untuk komposisi varian kita.)
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
