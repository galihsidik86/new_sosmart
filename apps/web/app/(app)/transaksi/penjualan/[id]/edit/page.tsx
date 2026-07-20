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

interface Detail {
  id: string; tanggal: string; cabangId: string; customerId: string;
  termin: 'TUNAI' | 'KREDIT'; akunArId: string; deskripsi: string | null;
  linkBukti: string | null;
  linkBuktiTambahan: string[];
  termPembayaranId: string | null;
  hargaTermasukPajak: boolean;
  status: 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  lines: Array<{
    no: number; itemId: string | null; deskripsi: string; qty: string; satuan: string;
    hargaSatuan: string; diskonPersen: string; isJasa: boolean;
    klasifikasiPpn: 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';
    akunPendapatanId: string;
    projectId: string | null;
  }>;
}

export default async function PenjualanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [inv, items, customers, cabang, accounts, projects, terms] = await Promise.all([
    apiFetch<Detail>(`/sales-invoices/${id}`, { tenantId }),
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Customer[]>('/customers', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<Project[]>('/projects', { tenantId }),
    apiFetch<Term[]>('/term-pembayaran', { tenantId }),
  ]);

  if (inv.status !== 'DRAFT') {
    redirect(`/transaksi/penjualan/${id}`);
  }

  const kasBank = accounts.filter(
    (a) => a.isPostable && (a.kode === '1-101' || a.kode.startsWith('1-102')),
  );

  async function submitEdit(formData: FormData): Promise<FormState> {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    try {
      await apiFetch(`/sales-invoices/${id}`, {
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
      <PageContainer size="wide">
        <BackLink href={`/transaksi/penjualan/${id}`} label="← Kembali ke detail faktur" />
        <PageHeader title="Edit Draft Faktur" />
        <InvoiceForm
          mode="sales"
          items={items.filter((i) => i.isAktif || inv.lines.some((l) => l.itemId === i.id))}
          parties={customers}
          cabang={cabang}
          accounts={accounts}
          kasBankAccounts={kasBank}
          projects={projects}
          termPembayaran={terms}
          submit={submitEdit}
          redirectTo={`/transaksi/penjualan/${id}`}
          submitLabel="Simpan perubahan"
          defaultValues={{
            tanggal: inv.tanggal.slice(0, 10),
            partyId: inv.customerId,
            cabangId: inv.cabangId,
            termin: inv.termin,
            tarifPpn: 11,
            hargaTermasukPajak: inv.hargaTermasukPajak,
            deskripsi: inv.deskripsi ?? '',
            linkBukti: inv.linkBukti ?? '',
            linkBuktiTambahan: inv.linkBuktiTambahan ?? [],
            termPembayaranId: inv.termPembayaranId ?? '',
            kasBankId: inv.termin === 'TUNAI' ? inv.akunArId : undefined,
            lines: inv.lines
              .sort((a, b) => a.no - b.no)
              .map((l) => ({
                itemId: l.itemId,
                deskripsi: l.deskripsi,
                qty: l.qty,
                satuan: l.satuan,
                hargaSatuan: l.hargaSatuan,
                diskonPersen: l.diskonPersen,
                klasifikasiPpn: l.klasifikasiPpn,
                isJasa: l.isJasa,
                accountId: l.akunPendapatanId,
                projectId: l.projectId ?? '',
              })),
          }}
        />
      </PageContainer>
    </>
  );
}
