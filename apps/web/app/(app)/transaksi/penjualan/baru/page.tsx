import { redirect } from 'next/navigation';
import { InvoiceForm } from '@/components/InvoiceForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Item {
  id: string; kode: string; nama: string; satuan: string;
  hargaJualDefault: string; klasifikasiPpn: 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';
  isJasa: boolean; isAktif: boolean;
  akunPendapatanId: string | null;
  akunPersediaanId: string | null;
  akunBebanId: string | null;
  pph23Tarif: { kode: string; nama: string; tarif: string } | null;
}
interface Customer {
  id: string; kode: string; nama: string; isPkp: boolean;
  terminHari: number; akunPiutangId: string | null;
}
interface Cabang { id: string; kode: string; nama: string }
interface Account { id: string; kode: string; nama: string; isPostable: boolean; kind: string }
interface Project { id: string; kode: string; nama: string }
interface Term { id: string; nama: string; hari: number }

async function submitInvoice(formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  try {
    await apiFetch('/sales-invoices', {
      method: 'POST', tenantId,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return apiErrorToState(e);
  }
  return { ok: true };
}

export default async function PenjualanBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [items, customers, cabang, accounts, projects, terms] = await Promise.all([
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Customer[]>('/customers', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
    apiFetch<Term[]>('/term-pembayaran', { tenantId }),
  ]);
  // Akun kas/bank: kode 1-101 atau 1-102x
  const kasBank = accounts.filter(
    (a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')),
  );
  return (
    <>
      <PageContainer size="form">
        <BackLink href="/transaksi/penjualan" label="← Kembali ke daftar penjualan" />
        <PageHeader title="Faktur Penjualan Baru" />
        <InvoiceForm
          mode="sales"
          items={items.filter((i) => i.isAktif)}
          parties={customers}
          cabang={cabang}
          accounts={accounts}
          kasBankAccounts={kasBank}
          projects={projects}
          termPembayaran={terms}
          submit={submitInvoice}
        />
      </PageContainer>
    </>
  );
}
