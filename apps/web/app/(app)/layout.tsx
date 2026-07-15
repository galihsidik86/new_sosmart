import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { ApprovalNotifier } from '@/components/ApprovalNotifier';

interface PeriodYear {
  periods: Array<{ label: string; status: string }>;
}

interface ApprovalInboxItem {
  id: string; docType: string; docId: string; amount: string;
  currentStep: number; totalSteps: number; currentRole: string;
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
  let approvalInbox: ApprovalInboxItem[] = [];
  try {
    const [prof, years, inbox] = await Promise.all([
      apiFetch<{ logoUrl: string | null }>('/tenants/current', { tenantId: s.tenantId }),
      apiFetch<PeriodYear[]>('/periods/years', { tenantId: s.tenantId }).catch(() => [] as PeriodYear[]),
      apiFetch<ApprovalInboxItem[]>('/approval/inbox', { tenantId: s.tenantId }).catch(() => [] as ApprovalInboxItem[]),
    ]);
    logoUrl = prof.logoUrl;
    periodeLabel = years[0]?.periods.find((p) => p.status === 'OPEN')?.label;
    approvalInbox = inbox;
  } catch { /* logo, periode & inbox opsional */ }

  return (
    <div className="flex min-h-screen bg-cream-100">
      <Sidebar
        user={s.user}
        tenantNama={s.tenantNama}
        role={s.role}
        logoUrl={logoUrl}
      />
      <main className="flex-1 min-w-0 flex flex-col bg-cream-100">
        <Topbar
          tenantNama={s.tenantNama ?? 'Lentera'}
          periodeLabel={periodeLabel}
          user={s.user}
          role={s.role}
        />
        {children}
      </main>
      <ApprovalNotifier items={approvalInbox} userId={s.user.id} />
    </div>
  );
}
