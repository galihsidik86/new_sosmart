import Link from 'next/link';
import type { Route } from 'next';
import { buttonClass } from '@/components/ui';

/** Tombol "Batal" (secondary) yang menavigasi kembali — dipakai di bawah form. */
export function CancelButton({
  href,
  label = 'Batal',
  className = 'w-full mt-3',
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link href={href as Route} className={`${buttonClass('secondary')} ${className}`}>
      {label}
    </Link>
  );
}
