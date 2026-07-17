'use client';

import { useActionState } from 'react';
import { FormField, Input, Select, Button } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

interface Partner { tenantId: string; nama: string }

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
  partnerTenantId?: string | null;
}

export function VendorForm({
  mode,
  action,
  defaults,
  partners,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: VendorDefaults;
  partners?: Partner[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};

  return (
    <form action={formAction} className="space-y-3 text-sm">
      {mode === 'edit' && <input type="hidden" name="id" value={d.id} />}
      {!state.ok && state.message && !state.fieldErrors && (
        <div className="px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-xs text-bata-700">
          {state.message}
        </div>
      )}
      <FormField label="Kode" required>
        <Input name="kode" required defaultValue={d.kode ?? ''} invalid={!!fe.kode} placeholder="VEN-006" />
        <FieldError msg={fe.kode} />
      </FormField>
      <FormField label="Nama" required>
        <Input name="nama" required defaultValue={d.nama ?? ''} invalid={!!fe.nama} placeholder="PT …" />
        <FieldError msg={fe.nama} />
      </FormField>
      <FormField label="NPWP (15/16 digit)">
        <Input name="npwp" defaultValue={d.npwp ?? ''} invalid={!!fe.npwp} placeholder="01.234.567.8-501.000" />
        <FieldError msg={fe.npwp} />
      </FormField>
      <label className="flex items-center gap-2 text-tanah-700">
        <input type="checkbox" name="isPkp" defaultChecked={!!d.isPkp} />
        Pemasok ini PKP (PPN masukan dapat dikreditkan)
      </label>
      <FormField label="Kategori">
        <Input name="kategori" defaultValue={d.kategori ?? ''} placeholder="Barang Dagang / Jasa" />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Kota"><Input name="kota" defaultValue={d.kota ?? ''} /></FormField>
        <FormField label="Telp"><Input name="telp" defaultValue={d.telp ?? ''} /></FormField>
      </div>
      <FormField label="Termin (hari)">
        <Input name="terminHari" type="number" defaultValue={String(d.terminHari ?? 30)} invalid={!!fe.terminHari} />
        <FieldError msg={fe.terminHari} />
      </FormField>
      {partners && partners.length > 0 && (
        <FormField label="Entitas intra-grup (intercompany)">
          <Select name="partnerTenantId" defaultValue={d.partnerTenantId ?? ''}>
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
