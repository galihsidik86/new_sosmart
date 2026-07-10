import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select,
  Table, THead, TH, TBody, TR, TD, MoneyCell, EmptyRow, buttonClass,
} from '@/components/ui';

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

async function createItem(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error('Tenant tidak aktif');
  const isJasa = formData.get('isJasa') === 'on';
  const pph23TarifId = String(formData.get('pph23TarifId') ?? '');
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
  revalidatePath('/master/barang');
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
      <Topbar breadcrumb="Master Barang" tenantNama={s.tenantNama!} />
      <PageContainer size="list">
        <PageHeader
          title="Master Barang & Jasa"
          subtitle={`${items.length} item · klasifikasi PPN mengikuti PMK 131/2024.`}
          actions={
            <>
              <a href="/proxy/items/export.xlsx" className={buttonClass('success')}>Export Excel</a>
              <ImportExcelButton importAction={importItemsAction} />
              <form className="flex items-center gap-2">
                <input
                  name="search"
                  defaultValue={sp.search ?? ''}
                  placeholder="Cari kode / nama…"
                  className="px-3 py-2 bg-white border border-cream-300 rounded-lg text-sm w-64 focus:outline-none focus:border-sogan-500"
                />
                <button className="px-3 py-2 bg-cream-100 border border-cream-300 rounded-lg text-sm font-semibold text-tanah-700">
                  Cari
                </button>
              </form>
            </>
          }
        />

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2">
            <Table>
              <THead>
                <TH>Kode</TH>
                <TH>Nama</TH>
                <TH>Klasifikasi PPN</TH>
                <TH numeric>Harga Jual</TH>
                <TH numeric>Stok Awal</TH>
                <TH numeric className="w-16" />
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
                    <TD className="text-right">
                      <Link href={`/master/barang/${it.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">
                        Edit
                      </Link>
                    </TD>
                  </TR>
                ))}
                {items.length === 0 && <EmptyRow colSpan={6}>Belum ada barang.</EmptyRow>}
              </TBody>
            </Table>
          </section>

          <Card>
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Item</h2>
            <form action={createItem} className="space-y-3">
              <FormField label="Kode" required><Input name="kode" required placeholder="BRG-007" /></FormField>
              <FormField label="Nama" required><Input name="nama" required placeholder="Beras Medium 5 kg" /></FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Kategori"><Input name="kategori" placeholder="Sembako" /></FormField>
                <FormField label="Satuan"><Input name="satuan" defaultValue="Pcs" /></FormField>
              </div>
              <FormField label="Harga jual (Rp)"><Input name="hargaJualDefault" type="number" defaultValue="0" /></FormField>
              <FormField label="Klasifikasi PPN">
                <Select name="klasifikasiPpn" defaultValue="BKP">
                  {(['BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN'] as const).map((k) => (
                    <option key={k} value={k}>
                      {KLASIFIKASI_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isJasa" />
                Adalah jasa (kena PPh 23)
              </label>
              <FormField
                label={
                  <>
                    Tarif PPh 23 <span className="text-tanah-400 normal-case font-normal">(hanya jika jasa)</span>
                  </>
                }
              >
                <Select name="pph23TarifId" defaultValue="">
                  <option value="">— tidak preset —</option>
                  {tarifList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {Number(t.tarif)}% · {t.nama}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button type="submit" className="w-full">Simpan</Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
