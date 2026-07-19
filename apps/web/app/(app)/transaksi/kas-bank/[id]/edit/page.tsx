import { redirect } from 'next/navigation';
import { CashBankForm } from '@/components/CashBankForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface SalesRow {
  id: string; nomor: string | null; status: string;
  totalNetto: string; totalDibayar: string;
  customer: { id: string; nama: string };
  lines: Array<{ projectId: string | null }>;
}
interface PurchaseRow {
  id: string; nomor: string | null; status: string;
  totalNetto: string; totalDibayar: string;
  vendor: { id: string; nama: string };
  lines: Array<{ projectId: string | null }>;
}

const projectIdsOf = (lines: Array<{ projectId: string | null }>) =>
  Array.from(new Set(lines.map((l) => l.projectId).filter((x): x is string => !!x)));
interface Project { id: string; kode: string; nama: string }

interface Detail {
  id: string;
  tanggal: string;
  tipe: 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
  cabangId: string;
  akunKasBankId: string;
  akunKasBankLawanId: string | null;
  total: string;
  kontak: string | null;
  deskripsi: string | null;
  linkBukti: string | null;
  linkBuktiTambahan: string[];
  salesInvoiceId: string | null;
  purchaseInvoiceId: string | null;
  pph23Dipotong: string | null;
  noBuktiPotong: string | null;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  lines: Array<{
    no: number; accountId: string; projectId: string | null; nilai: string; deskripsi: string | null;
  }>;
}

export default async function KasBankEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [e, accounts, cabang, salesPosted, salesPartial, purchasePosted, purchasePartial, projects] = await Promise.all([
    apiFetch<Detail>(`/cash-bank/${id}`, { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=POSTED', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=PARTIAL', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=POSTED', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=PARTIAL', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
  ]);

  if (e.status !== 'DRAFT') redirect(`/transaksi/kas-bank/${id}`);

  const kasBank = accounts.filter(
    (a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')),
  );
  const openSales = [...salesPosted, ...salesPartial].map((r) => ({
    id: r.id, nomor: r.nomor,
    vendorOrCustomer: r.customer.nama, partaiId: r.customer.id,
    projectIds: projectIdsOf(r.lines),
    totalNetto: r.totalNetto, totalDibayar: r.totalDibayar,
  }));
  const openPurchases = [...purchasePosted, ...purchasePartial].map((r) => ({
    id: r.id, nomor: r.nomor,
    vendorOrCustomer: r.vendor.nama, partaiId: r.vendor.id,
    projectIds: projectIdsOf(r.lines),
    totalNetto: r.totalNetto, totalDibayar: r.totalDibayar,
  }));

  async function submitEdit(formData: FormData): Promise<FormState> {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    try {
      await apiFetch(`/cash-bank/${id}`, {
        method: 'PATCH', tenantId: tid,
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return apiErrorToState(e);
    }
    return { ok: true };
  }

  return (
    <>
      <PageContainer size="form">
        <BackLink href={`/transaksi/kas-bank/${id}`} label="← Kembali ke detail kas/bank" />
        <PageHeader title="Edit Draft Bukti Kas/Bank" />
        <CashBankForm
          accounts={accounts} kasBank={kasBank} cabang={cabang}
          openSales={openSales} openPurchases={openPurchases}
          projects={projects}
          submit={submitEdit}
          redirectTo={`/transaksi/kas-bank/${id}`}
          submitLabel="Simpan perubahan"
          defaultValues={{
            tanggal: e.tanggal.slice(0, 10),
            tipe: e.tipe,
            cabangId: e.cabangId,
            akunKasBankId: e.akunKasBankId,
            akunKasBankLawanId: e.akunKasBankLawanId ?? undefined,
            total: e.total,
            kontak: e.kontak ?? '',
            deskripsi: e.deskripsi ?? '',
            linkBukti: e.linkBukti ?? '',
            linkBuktiTambahan: e.linkBuktiTambahan ?? [],
            salesInvoiceId: e.salesInvoiceId ?? '',
            purchaseInvoiceId: e.purchaseInvoiceId ?? '',
            pph23Dipotong: e.pph23Dipotong ?? '0',
            noBuktiPotong: e.noBuktiPotong ?? '',
            lines: e.lines
              .sort((a, b) => a.no - b.no)
              .map((l) => ({
                accountId: l.accountId,
                projectId: l.projectId ?? '',
                nilai: l.nilai,
                deskripsi: l.deskripsi ?? '',
              })),
          }}
        />
      </PageContainer>
    </>
  );
}
