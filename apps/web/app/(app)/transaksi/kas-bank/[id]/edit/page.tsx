import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { CashBankForm } from '@/components/CashBankForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

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
  salesInvoiceId: string | null;
  purchaseInvoiceId: string | null;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  lines: Array<{
    no: number; accountId: string; nilai: string; deskripsi: string | null;
  }>;
}

export default async function KasBankEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [e, accounts, cabang, salesPosted, salesPartial, purchasePosted, purchasePartial] = await Promise.all([
    apiFetch<Detail>(`/cash-bank/${id}`, { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=POSTED', { tenantId }),
    apiFetch<SalesRow[]>('/sales-invoices?status=PARTIAL', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=POSTED', { tenantId }),
    apiFetch<PurchaseRow[]>('/purchase-invoices?status=PARTIAL', { tenantId }),
  ]);

  if (e.status !== 'DRAFT') redirect(`/transaksi/kas-bank/${id}`);

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

  async function submitEdit(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    await apiFetch(`/cash-bank/${id}`, {
      method: 'PATCH', tenantId: tid,
      body: JSON.stringify(payload),
    });
  }

  return (
    <>
      <Topbar breadcrumb="Kas/Bank / Edit Draft" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-6">
          Edit Draft Bukti Kas/Bank
        </h1>
        <CashBankForm
          accounts={accounts} kasBank={kasBank} cabang={cabang}
          openSales={openSales} openPurchases={openPurchases}
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
            salesInvoiceId: e.salesInvoiceId ?? '',
            purchaseInvoiceId: e.purchaseInvoiceId ?? '',
            lines: e.lines
              .sort((a, b) => a.no - b.no)
              .map((l) => ({
                accountId: l.accountId,
                nilai: l.nilai,
                deskripsi: l.deskripsi ?? '',
              })),
          }}
        />
      </div>
    </>
  );
}
