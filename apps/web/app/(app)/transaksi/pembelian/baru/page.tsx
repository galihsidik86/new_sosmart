import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { InvoiceForm } from '@/components/InvoiceForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';

interface Item {
  id: string; kode: string; nama: string; satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn: 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';
  isJasa: boolean; isAktif: boolean;
  akunPendapatanId: string | null;
  akunPersediaanId: string | null;
  akunBebanId: string | null;
  pph23Tarif: { kode: string; nama: string; tarif: string } | null;
}
interface Vendor {
  id: string; kode: string; nama: string; isPkp: boolean;
  terminHari: number; akunUtangId: string | null;
}
interface Cabang { id: string; kode: string; nama: string }
interface Account { id: string; kode: string; nama: string; isPostable: boolean; kind: string }
interface Project { id: string; kode: string; nama: string }

async function submitBill(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  await apiFetch('/purchase-invoices', {
    method: 'POST', tenantId,
    body: JSON.stringify(payload),
  });
}

export default async function PembelianBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [items, vendors, cabang, accounts, projects] = await Promise.all([
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Vendor[]>('/vendors', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
  ]);
  const kasBank = accounts.filter(
    (a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')),
  );
  return (
    <>
      <Topbar breadcrumb="Pembelian / Baru" tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <PageHeader title="Tagihan Pembelian Baru" />
        <InvoiceForm
          mode="purchase"
          items={items.filter((i) => i.isAktif)}
          parties={vendors}
          cabang={cabang}
          accounts={accounts}
          kasBankAccounts={kasBank}
          projects={projects}
          submit={submitBill}
        />
      </PageContainer>
    </>
  );
}
