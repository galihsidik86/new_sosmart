import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

interface PeriodYear {
  periods: Array<{ label: string; status: string }>;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.tenantId) redirect('/pilih-tenant');

  let logoUrl: string | null = null;
  let periodeLabel: string | undefined;
  try {
    const [prof, years] = await Promise.all([
      apiFetch<{ logoUrl: string | null }>('/tenants/current', { tenantId: s.tenantId }),
      apiFetch<PeriodYear[]>('/periods/years', { tenantId: s.tenantId }).catch(() => [] as PeriodYear[]),
    ]);
    logoUrl = prof.logoUrl;
    periodeLabel = years[0]?.periods.find((p) => p.status === 'OPEN')?.label;
  } catch { /* logo & periode opsional */ }

  return (
    <div className="flex min-h-screen bg-cream-100">
      <Sidebar
        user={s.user}
        tenantNama={s.tenantNama}
        role={s.role}
        logoUrl={logoUrl}
      />
      <main className="flex-1 min-w-0 flex flex-col">
        <Topbar tenantNama={s.tenantNama ?? 'Lentera'} periodeLabel={periodeLabel} />
        {children}
      </main>
    </div>
  );
}
