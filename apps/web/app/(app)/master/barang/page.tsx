import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Badge,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, buttonClass,
} from '@/components/ui';
import { ItemForm } from '@/components/ItemForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

async function importItemsAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/items/import', file);
  revalidatePath('/master/barang');
  return result;
}

interface ItemRow {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn:
    | 'BKP'
    | 'JKP'
    | 'NON_BKP'
    | 'BKP_STRATEGIS'
    | 'BEBAS_PPN';
  isJasa: boolean;
  isAktif: boolean;
  pph23Tarif: { kode: string; nama: string; tarif: string } | null;
  stokAwal: Array<{ qty: string; cabang: { kode: string } }>;
}
interface Pph23Tarif { id: string; kode: string; nama: string; tarif: string }

const KLASIFIKASI_LABEL: Record<ItemRow['klasifikasiPpn'], string> = {
  BKP: 'BKP (Kena PPN)',
  JKP: 'JKP (Kena PPN)',
  NON_BKP: 'Non-BKP',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  BEBAS_PPN: 'Bebas PPN',
};

async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  const isJasa = formData.get('isJasa') === 'on';
  const pph23TarifId = String(formData.get('pph23TarifId') ?? '');
  try {
    await apiFetch('/items', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        kategori: formData.get('kategori') || undefined,
        satuan: formData.get('satuan') || 'Pcs',
        hargaJualDefault: String(formData.get('hargaJualDefault') ?? '0'),
        klasifikasiPpn: formData.get('klasifikasiPpn') ?? 'BKP',
        isJasa,
        pph23TarifId: isJasa && pph23TarifId ? pph23TarifId : null,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/barang');
  redirect('/master/barang');
}

export default async function MasterBarangPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const sp = await searchParams;

  const qs = sp.search ? `?search=${encodeURIComponent(sp.search)}` : '';
  const [items, tarifList] = await Promise.all([
    apiFetch<ItemRow[]>(`/items${qs}`, { tenantId }),
    apiFetch<Pph23Tarif[]>('/pph23-tarif', { tenantId }).catch(() => [] as Pph23Tarif[]),
  ]);

  return (
    <>
      <PageContainer size="list">
        <PageHeader
          title="Master Barang & Jasa"
          subtitle={`${items.length} item · klasifikasi PPN mengikuti PMK 131/2024.`}
          actions={
            <>
              <a href="/proxy/items/export.xlsx" className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importItemsAction} />
              <form className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  name="search"
                  defaultValue={sp.search ?? ''}
                  placeholder="Cari kode / nama…"
                  className="px-3 py-2 bg-white border border-cream-300 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:border-sogan-500"
                />
                <button className="px-3 py-2 bg-cream-100 border border-cream-300 rounded-lg text-sm font-semibold text-tanah-700">
                  Cari
                </button>
              </form>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama</TH>
                <TH>Klasifikasi PPN</TH>
                <TH numeric>Harga Jual</TH>
                <TH numeric>Stok Awal</TH>
                <TH numeric stickyEnd className="w-16" />
              </THead>
              <TBody>
                {items.map((it) => (
                  <TR key={it.id}>
                    <TD className="font-mono text-tanah-700">{it.kode}</TD>
                    <TD>
                      <div className="font-semibold text-tanah-700">{it.nama}</div>
                      <div className="text-xs text-tanah-500">
                        {it.kategori ?? '—'} · {it.satuan}
                      </div>
                    </TD>
                    <TD>
                      <Badge
                        variant={
                          it.klasifikasiPpn === 'BKP_STRATEGIS'
                            ? 'success'
                            : it.klasifikasiPpn === 'NON_BKP' ||
                              it.klasifikasiPpn === 'BEBAS_PPN'
                            ? 'neutral'
                            : 'brand'
                        }
                        size="sm"
                      >
                        {KLASIFIKASI_LABEL[it.klasifikasiPpn]}
                      </Badge>
                      {it.isJasa && (
                        <span className="ml-2 text-[10px] text-emas-700 font-semibold uppercase">
                          Jasa
                        </span>
                      )}
                      {it.pph23Tarif && (
                        <span
                          className="ml-1 text-[10px] font-mono text-bata-700 bg-bata-50 border border-bata-200 rounded px-1.5 py-0.5"
                          title={it.pph23Tarif.nama}
                        >
                          PPh23 {Number(it.pph23Tarif.tarif)}%
                        </span>
                      )}
                    </TD>
                    <MoneyCell className="text-tanah-700">
                      {fmtRp(it.hargaJualDefault)}
                    </MoneyCell>
                    <TD className="text-right text-tanah-500 tabular-nums">
                      {it.stokAwal[0]?.qty
                        ? `${Number(it.stokAwal[0].qty).toLocaleString('id-ID')} · ${it.stokAwal[0].cabang.kode}`
                        : '—'}
                    </TD>
                    <TD stickyEnd className="text-right">
                      <RowActions>
                        <Link href={`/master/barang/${it.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                          Edit
                        </Link>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
                {items.length === 0 && <EmptyRow colSpan={6}>Belum ada barang.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Item</h2>
            <ItemForm mode="create" action={createItem} tarifList={tarifList} />
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
