import Link from 'next/link';
import type { Route } from 'next';

/** Link "← Kembali" kecil di atas form (baru/edit). */
export function BackLink({ href, label = '← Kembali' }: { href: string; label?: string }) {
  return (
    <div className="mb-2">
      <Link href={href as Route} className="text-sm text-sogan-500 hover:underline">
        {label}
      </Link>
    </div>
  );
}
