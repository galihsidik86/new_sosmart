import { clearSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { Icon } from './ui/icons';

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
    <header className="h-16 bg-cream-50/85 backdrop-blur border-b border-cream-200 pl-14 pr-4 md:px-8 flex items-center gap-4 sticky top-0 z-10">
      <div className="text-sm text-tanah-500 truncate">
        <span className="hidden sm:inline">{tenantNama} </span>
        <span className="text-tanah-300">/</span>{' '}
        <span className="text-tanah-700 font-semibold">{breadcrumb}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {periodeLabel && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-cream-300 rounded-md text-xs font-semibold text-tanah-700">
            <Icon name="calendar" size={14} className="text-sogan-500" />
            {periodeLabel}
          </div>
        )}
        <form action={logoutAction}>
          <button className="inline-flex items-center gap-1.5 text-sm text-tanah-700 hover:text-sogan-500 font-semibold transition-colors duration-fast">
            <Icon name="logout" size={16} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </form>
      </div>
    </header>
  );
}
