import { redirect } from 'next/navigation';
import { OpnameForm } from '@/components/OpnameForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';

interface Item { id: string; kode: string; nama: string; satuan: string; isAktif: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface SaldoRow {
  item: { id: string; kode: string; nama: string; satuan: string };
  cabang: { id: string; kode: string };
  qty: string;
  nilai: string;
}

interface Detail {
  id: string; tanggal: string; cabangId: string; alasan: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED' | 'PARTIAL' | 'PAID';
  lines: Array<{
    no: number; itemId: string;
    qtySaatIni: string; qtyFisik: string; hargaPokok: string;
    keterangan: string | null;
    item: { kode: string; nama: string; satuan: string };
  }>;
}

export default async function OpnameEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [adj, items, cabang, allSaldo] = await Promise.all([
    apiFetch<Detail>(`/stok-adjustments/${id}`, { tenantId }),
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<SaldoRow[]>('/inventory/saldo', { tenantId }),
  ]);

  if (adj.status !== 'DRAFT') redirect(`/persediaan/penyesuaian/${id}`);

  const saldoMap: Record<string, SaldoRow[]> = {};
  for (const r of allSaldo) {
    (saldoMap[r.cabang.id] ??= []).push(r);
  }

  async function submitEdit(formData: FormData) {
    'use server';
    const tid = await getActiveTenantId(); if (!tid) redirect('/login');
    const payload = JSON.parse(String(formData.get('payload')));
    await apiFetch(`/stok-adjustments/${id}`, {
      method: 'PATCH', tenantId: tid,
      body: JSON.stringify(payload),
    });
  }

  return (
    <>
      <PageContainer size="wide">
        <BackLink href={`/persediaan/penyesuaian/${id}`} label="← Kembali ke detail opname" />
        <PageHeader title="Edit Draft Opname" />
        <OpnameForm
          items={items}
          cabang={cabang}
          saldoMap={saldoMap}
          submit={submitEdit}
          redirectTo={`/persediaan/penyesuaian/${id}`}
          submitLabel="Simpan perubahan"
          defaultValues={{
            tanggal: adj.tanggal.slice(0, 10),
            cabangId: adj.cabangId,
            alasan: adj.alasan,
            lines: adj.lines
              .sort((a, b) => a.no - b.no)
              .map((l) => ({
                itemId: l.itemId,
                itemNama: `${l.item.kode}  ${l.item.nama}`,
                satuan: l.item.satuan,
                qtySaatIni: l.qtySaatIni,
                qtyFisik: l.qtyFisik,
                hargaPokok: l.hargaPokok,
                keterangan: l.keterangan ?? '',
              })),
          }}
        />
      </PageContainer>
    </>
  );
}
