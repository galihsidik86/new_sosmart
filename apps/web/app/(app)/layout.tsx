import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.tenantId) redirect('/pilih-tenant');

  let logoUrl: string | null = null;
  try {
    const prof = await apiFetch<{ logoUrl: string | null }>('/tenants/current', { tenantId: s.tenantId });
    logoUrl = prof.logoUrl;
  } catch { /* logo opsional */ }

  return (
    <div className="flex min-h-screen bg-cream-100">
      <Sidebar
        user={s.user}
        tenantNama={s.tenantNama}
        role={s.role}
        logoUrl={logoUrl}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
