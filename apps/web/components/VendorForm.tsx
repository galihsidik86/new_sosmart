'use client';

import { useActionState, useMemo, useState } from 'react';
import { FormField, Input, Select, Button, Combobox } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

interface Partner { tenantId: string; nama: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

export interface VendorDefaults {
  id?: string;
  kode?: string;
  nama?: string;
  npwp?: string | null;
  isPkp?: boolean;
  kategori?: string | null;
  kota?: string | null;
  telp?: string | null;
  terminHari?: number;
  akunUtangId?: string | null;
  partnerTenantId?: string | null;
}

export function VendorForm({
  mode,
  action,
  accounts = [],
  defaults,
  partners,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  accounts?: Account[];
  defaults?: VendorDefaults;
  partners?: Partner[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;
  const pkp = sv ? sv.isPkp === 'on' : !!d.isPkp;
  const [akunUtangId, setAkunUtangId] = useState(v('akunUtangId', d.akunUtangId ?? ''));
  // Akun utang: liabilitas (kelompok 2) berjenis utang.
  const utangOpts = useMemo(
    () => [
      { value: '', label: '— default (2-101 Utang Usaha) —' },
      ...accounts.filter((a) => a.isPostable && a.kind === 'LIABILITAS' && a.nama.toLowerCase().includes('utang'))
        .map((a) => ({ value: a.id, label: `${a.kode}  ${a.nama}` })),
    ],
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
        <Input name="kode" required defaultValue={v('kode', d.kode ?? '')} invalid={!!fe.kode} placeholder="VEN-006" />
        <FieldError msg={fe.kode} />
      </FormField>
      <FormField label="Nama" required>
        <Input name="nama" required defaultValue={v('nama', d.nama ?? '')} invalid={!!fe.nama} placeholder="PT …" />
        <FieldError msg={fe.nama} />
      </FormField>
      <FormField label="NPWP (15/16 digit)">
        <Input name="npwp" defaultValue={v('npwp', d.npwp ?? '')} invalid={!!fe.npwp} placeholder="01.234.567.8-501.000" />
        <FieldError msg={fe.npwp} />
      </FormField>
      <label className="flex items-center gap-2 text-tanah-700">
        <input type="checkbox" name="isPkp" defaultChecked={pkp} />
        Pemasok ini PKP (PPN masukan dapat dikreditkan)
      </label>
      <FormField label="Kategori">
        <Input name="kategori" defaultValue={v('kategori', d.kategori ?? '')} placeholder="Barang Dagang / Jasa" />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Kota"><Input name="kota" defaultValue={v('kota', d.kota ?? '')} /></FormField>
        <FormField label="Telp"><Input name="telp" defaultValue={v('telp', d.telp ?? '')} /></FormField>
      </div>
      <FormField label="Termin Pembayaran (hari)">
        <Input name="terminHari" type="number" defaultValue={v('terminHari', String(d.terminHari ?? 30))} invalid={!!fe.terminHari} />
        <FieldError msg={fe.terminHari} />
      </FormField>
      <FormField label={<>Akun Utang <span className="text-tanah-500 normal-case font-normal">(default auto-jurnal)</span></>}>
        <Combobox name="akunUtangId" value={akunUtangId} onChange={setAkunUtangId} options={utangOpts} mono placeholder="— default (2-101 Utang Usaha) —" />
      </FormField>
      {partners && partners.length > 0 && (
        <FormField label="Entitas intra-grup (intercompany)">
          <Select name="partnerTenantId" defaultValue={v('partnerTenantId', d.partnerTenantId ?? '')}>
            <option value="">— bukan intra-grup —</option>
            {partners.map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.nama}</option>
            ))}
          </Select>
        </FormField>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Menyimpan…' : (submitLabel ?? 'Simpan')}
      </Button>
    </form>
  );
}
