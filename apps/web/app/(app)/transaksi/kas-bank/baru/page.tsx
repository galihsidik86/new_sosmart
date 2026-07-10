import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { CashBankForm } from '@/components/CashBankForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';

interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface SalesRow {
  id: string; nomor: string | null; status: string;
  totalNetto: string; totalDibayar: string;
  customer: { nama: string };
}
interface PurchaseRow {
  id: string; nomor: string | null; status: string;
  totalNetto: string; totalDibayar: string;
  vendor: { nama: string };
}
interface Project { id: string; kode: string; nama: string }

async function submitCashBank(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  await apiFetch('/cash-bank', {
    method: 'POST', tenantId,
    body: JSON.stringify(payload),
  });
}

export default async function KasBankBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [accounts, cabang, salesPosted, salesPartial, purchasePosted, purchasePartial, projects] = await Promise.all([
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=POSTED', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=PARTIAL', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=POSTED', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=PARTIAL', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
  ]);
  const kasBank = accounts.filter(
    (a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')),
  );
  const openSales = [...salesPosted, ...salesPartial].map((r) => ({
    id: r.id, nomor: r.nomor,
    vendorOrCustomer: r.customer.nama,
    totalNetto: r.totalNetto, totalDibayar: r.totalDibayar,
  }));
  const openPurchases = [...purchasePosted, ...purchasePartial].map((r) => ({
    id: r.id, nomor: r.nomor,
    vendorOrCustomer: r.vendor.nama,
    totalNetto: r.totalNetto, totalDibayar: r.totalDibayar,
  }));

  return (
    <>
      <Topbar breadcrumb="Kas/Bank / Baru" tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <PageHeader title="Bukti Kas / Bank Baru" />
        <CashBankForm
          accounts={accounts} kasBank={kasBank} cabang={cabang}
          openSales={openSales} openPurchases={openPurchases}
          projects={projects}
          submit={submitCashBank}
        />
      </PageContainer>
    </>
  );
}
