'use client';

import { useActionState } from 'react';
import { FormField, Input, Select, Button } from '@/components/ui';
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
}

export function ItemForm({
  mode,
  action,
  tarifList,
  defaults,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  tarifList: Tarif[];
  defaults?: ItemDefaults;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;
  const jasa = sv ? sv.isJasa === 'on' : !!d.isJasa;

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
      <label className="flex items-center gap-2 text-tanah-700">
        <input type="checkbox" name="isJasa" defaultChecked={jasa} />
        Adalah jasa (kena PPh 23)
      </label>
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
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Menyimpan…' : (submitLabel ?? 'Simpan')}
      </Button>
    </form>
  );
}
