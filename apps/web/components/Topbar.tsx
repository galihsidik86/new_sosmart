import { clearSession } from '@/lib/session';
import { redirect } from 'next/navigation';

async function logoutAction() {
  'use server';
  await clearSession();
  redirect('/login');
}

interface TopbarProps {
  breadcrumb: string;
  tenantNama: string;
  periodeLabel?: string;
}

export function Topbar({ breadcrumb, tenantNama, periodeLabel }: TopbarProps) {
  return (
    <header className="h-16 bg-white/85 backdrop-blur border-b border-cream-200 px-8 flex items-center gap-4 sticky top-0 z-10">
      <div className="text-sm text-tanah-500">
        {tenantNama} <span className="text-tanah-300">/</span>{' '}
        <span className="text-tanah-700 font-semibold">{breadcrumb}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {periodeLabel && (
          <div className="px-3 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-xs font-semibold text-tanah-700">
            Periode: {periodeLabel}
          </div>
        )}
        <form action={logoutAction}>
          <button className="text-sm text-tanah-700 hover:text-sogan-500 font-semibold">
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
