'use client';

import { useActionState, useMemo, useState } from 'react';
import { FormField, Input, Select, Button, Combobox } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

type Klasifikasi = 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';
const KLASIFIKASI_LABEL: Record<Klasifikasi, string> = {
  BKP: 'BKP (Kena PPN)',
  JKP: 'JKP (Kena PPN)',
  NON_BKP: 'Non-BKP',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  BEBAS_PPN: 'Bebas PPN',
};
const KLASIFIKASI: Klasifikasi[] = ['BKP', 'JKP', 'NON_BKP', 'BKP_STRATEGIS', 'BEBAS_PPN'];

interface Tarif { id: string; nama: string; tarif: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

export interface ItemDefaults {
  id?: string;
  kode?: string;
  nama?: string;
  kategori?: string | null;
  satuan?: string;
  hargaJualDefault?: string;
  klasifikasiPpn?: Klasifikasi;
  isJasa?: boolean;
  pph23TarifId?: string | null;
  akunPendapatanId?: string | null;
  akunPersediaanId?: string | null;
  akunHppId?: string | null;
  akunBebanId?: string | null;
}

export function ItemForm({
  mode,
  action,
  tarifList,
  accounts,
  defaults,
  submitLabel,
  forceJasa = false,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  tarifList: Tarif[];
  accounts: Account[];
  defaults?: ItemDefaults;
  submitLabel?: string;
  /** Usaha jasa: item selalu jasa, ceklis disembunyikan. */
  forceJasa?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;

  const [isJasa, setIsJasa] = useState<boolean>(forceJasa ? true : (sv ? sv.isJasa === 'on' : !!d.isJasa));
  const [akunPendapatanId, setAkunPendapatanId] = useState(v('akunPendapatanId', d.akunPendapatanId ?? ''));
  const [akunPersediaanId, setAkunPersediaanId] = useState(v('akunPersediaanId', d.akunPersediaanId ?? ''));
  const [akunHppId, setAkunHppId] = useState(v('akunHppId', d.akunHppId ?? ''));
  const [akunBebanId, setAkunBebanId] = useState(v('akunBebanId', d.akunBebanId ?? ''));

  const opt = (a: Account) => ({ value: a.id, label: `${a.kode}  ${a.nama}` });
  const pilih = { value: '', label: '— pilih akun —' };
  const pendapatanOpts = useMemo(
    () => [pilih, ...accounts.filter((a) => a.isPostable && (a.kind === 'PENDAPATAN' || a.kind === 'PENDAPATAN_LAIN')).map(opt)],
    [accounts],
  );
  const persediaanOpts = useMemo(
    () => [pilih, ...accounts.filter((a) => a.isPostable && a.kind === 'ASET').map(opt)],
    [accounts],
  );
  const hppOpts = useMemo(
    () => [pilih, ...accounts.filter((a) => a.isPostable && a.kind === 'BEBAN_POKOK').map(opt)],
    [accounts],
  );
  const bebanOpts = useMemo(
    () => [pilih, ...accounts.filter((a) => a.isPostable && (a.kind === 'BEBAN' || a.kind === 'BEBAN_LAIN')).map(opt)],
    [accounts],
  );

  return (
    <form key={state.attempt ?? 0} action={formAction} className="space-y-3 text-sm">
      {mode === 'edit' && <input type="hidden" name="id" value={d.id} />}
      {!state.ok && state.message && !state.fieldErrors && (
        <div className="px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-xs text-bata-700">
          {state.message}
        </div>
      )}
      <FormField label="Kode" required>
        <Input name="kode" required defaultValue={v('kode', d.kode ?? '')} invalid={!!fe.kode} placeholder="BRG-007" />
        <FieldError msg={fe.kode} />
      </FormField>
      <FormField label="Nama" required>
        <Input name="nama" required defaultValue={v('nama', d.nama ?? '')} invalid={!!fe.nama} placeholder="Beras Medium 5 kg" />
        <FieldError msg={fe.nama} />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Kategori"><Input name="kategori" defaultValue={v('kategori', d.kategori ?? '')} placeholder="Sembako" /></FormField>
        <FormField label="Satuan"><Input name="satuan" defaultValue={v('satuan', d.satuan ?? 'Pcs')} invalid={!!fe.satuan} /></FormField>
      </div>
      <FormField label="Harga jual (Rp)">
        <Input name="hargaJualDefault" type="number" defaultValue={v('hargaJualDefault', d.hargaJualDefault ?? '0')} invalid={!!fe.hargaJualDefault} />
        <FieldError msg={fe.hargaJualDefault} />
      </FormField>
      <FormField label="Klasifikasi PPN">
        <Select name="klasifikasiPpn" defaultValue={v('klasifikasiPpn', d.klasifikasiPpn ?? 'BKP')}>
          {KLASIFIKASI.map((k) => (
            <option key={k} value={k}>{KLASIFIKASI_LABEL[k]}</option>
          ))}
        </Select>
      </FormField>
      {forceJasa ? (
        <>
          <input type="hidden" name="isJasa" value="on" />
          <div className="text-xs text-tanah-600 bg-cream-100 border border-cream-200 rounded-lg px-3 py-2">
            Jenis usaha perusahaan = <b>Jasa</b> → item ini otomatis berjenis <b>jasa</b> (tanpa persediaan/saldo awal).
          </div>
        </>
      ) : (
        <label className="flex items-center gap-2 text-tanah-700">
          <input type="checkbox" name="isJasa" checked={isJasa} onChange={(e) => setIsJasa(e.target.checked)} />
          Adalah jasa (kena PPh 23)
        </label>
      )}
      {isJasa && (
        <FormField
          label={<>Tarif PPh 23 <span className="text-tanah-500 normal-case font-normal">(hanya jika jasa)</span></>}
        >
          <Select name="pph23TarifId" defaultValue={v('pph23TarifId', d.pph23TarifId ?? '')}>
            <option value="">— tidak preset —</option>
            {tarifList.map((t) => (
              <option key={t.id} value={t.id}>{Number(t.tarif)}% · {t.nama}</option>
            ))}
          </Select>
        </FormField>
      )}

      <div className="pt-2 border-t border-cream-200">
        <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">Akun Default (auto-jurnal)</div>
        <FormField label="Akun Pendapatan">
          <Combobox name="akunPendapatanId" value={akunPendapatanId} onChange={setAkunPendapatanId} options={pendapatanOpts} mono placeholder="— pilih akun pendapatan —" />
        </FormField>
        {isJasa ? (
          <FormField label="Akun Beban (biaya jasa)">
            <Combobox name="akunBebanId" value={akunBebanId} onChange={setAkunBebanId} options={bebanOpts} mono placeholder="— pilih akun beban —" />
          </FormField>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FormField label="Akun Persediaan">
              <Combobox name="akunPersediaanId" value={akunPersediaanId} onChange={setAkunPersediaanId} options={persediaanOpts} mono placeholder="— pilih akun persediaan —" />
            </FormField>
            <FormField label="Akun HPP (Harga Pokok)">
              <Combobox name="akunHppId" value={akunHppId} onChange={setAkunHppId} options={hppOpts} mono placeholder="— pilih akun HPP —" />
            </FormField>
          </div>
        )}
        <p className="text-[11px] text-tanah-500 mt-1">
          Dipakai saat auto-posting faktur: pendapatan saat penjualan; {isJasa ? 'beban saat pembelian jasa' : 'persediaan & HPP saat stok masuk/keluar'}. Kosongkan untuk pakai default COA.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Menyimpan…' : (submitLabel ?? 'Simpan')}
      </Button>
    </form>
  );
}
