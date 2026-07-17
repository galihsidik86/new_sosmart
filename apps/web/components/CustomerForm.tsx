'use client';

import { useActionState } from 'react';
import { FormField, Input, Select, Button } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

interface Jenis { id: string; nama: string }
interface Partner { tenantId: string; nama: string }

export interface CustomerDefaults {
  id?: string;
  kode?: string;
  nama?: string;
  npwp?: string | null;
  isPkp?: boolean;
  jenisPelangganId?: string | null;
  kota?: string | null;
  telp?: string | null;
  terminHari?: number;
  kreditLimit?: string;
  partnerTenantId?: string | null;
}

export function CustomerForm({
  mode,
  action,
  jenisList,
  defaults,
  partners,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  jenisList: Jenis[];
  defaults?: CustomerDefaults;
  partners?: Partner[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;
  const pkp = sv ? sv.isPkp === 'on' : !!d.isPkp;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="space-y-3 text-sm">
      {mode === 'edit' && <input type="hidden" name="id" value={d.id} />}
      {!state.ok && state.message && !state.fieldErrors && (
        <div className="px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-xs text-bata-700">
          {state.message}
        </div>
      )}
      <FormField label="Kode" required>
        <Input name="kode" required defaultValue={v('kode', d.kode ?? '')} invalid={!!fe.kode} placeholder="PLG-006" />
        <FieldError msg={fe.kode} />
      </FormField>
      <FormField label="Nama" required>
        <Input name="nama" required defaultValue={v('nama', d.nama ?? '')} invalid={!!fe.nama} placeholder="PT / CV …" />
        <FieldError msg={fe.nama} />
      </FormField>
      <FormField label="NPWP (15/16 digit)">
        <Input name="npwp" defaultValue={v('npwp', d.npwp ?? '')} invalid={!!fe.npwp} placeholder="01.234.567.8-501.000" />
        <FieldError msg={fe.npwp} />
      </FormField>
      <label className="flex items-center gap-2 text-tanah-700">
        <input type="checkbox" name="isPkp" defaultChecked={pkp} />
        Pelanggan ini PKP
      </label>
      <FormField label="Jenis Pelanggan">
        <Select name="jenisPelangganId" defaultValue={v('jenisPelangganId', d.jenisPelangganId ?? '')}>
          <option value="">— pilih —</option>
          {jenisList.map((j) => (
            <option key={j.id} value={j.id}>{j.nama}</option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Kota"><Input name="kota" defaultValue={v('kota', d.kota ?? '')} /></FormField>
        <FormField label="Telp"><Input name="telp" defaultValue={v('telp', d.telp ?? '')} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Termin (hari)">
          <Input name="terminHari" type="number" defaultValue={v('terminHari', String(d.terminHari ?? 14))} invalid={!!fe.terminHari} />
          <FieldError msg={fe.terminHari} />
        </FormField>
        <FormField label="Limit kredit">
          <Input name="kreditLimit" type="number" defaultValue={v('kreditLimit', d.kreditLimit ?? '0')} invalid={!!fe.kreditLimit} />
          <FieldError msg={fe.kreditLimit} />
        </FormField>
      </div>
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
