'use client';

import { useActionState } from 'react';
import { FormField, Input, Select, Button } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

interface Cabang { id: string; kode: string; nama: string }

export interface KaryawanDefaults {
  id?: string;
  kode?: string;
  nama?: string;
  nik?: string;
  npwp?: string | null;
  jabatan?: string | null;
  ptkpStatus?: Ptkp;
  cabangId?: string | null;
  tanggalMasuk?: string;
  gajiPokok?: string;
  tunjanganTetap?: string;
  iuranBpjsKaryawan?: string;
}

export function KaryawanForm({
  mode,
  action,
  cabang,
  defaults,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cabang: Cabang[];
  defaults?: KaryawanDefaults;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="space-y-3 text-sm">
      {mode === 'edit' && <input type="hidden" name="id" value={d.id} />}
      {!state.ok && state.message && !state.fieldErrors && (
        <div className="px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-xs text-bata-700">
          {state.message}
        </div>
      )}
      <FormField label="Kode" required>
        <Input name="kode" required defaultValue={v('kode', d.kode ?? '')} invalid={!!fe.kode} placeholder="KAR-006" />
        <FieldError msg={fe.kode} />
      </FormField>
      <FormField label="Nama" required>
        <Input name="nama" required defaultValue={v('nama', d.nama ?? '')} invalid={!!fe.nama} placeholder="Nama lengkap" />
        <FieldError msg={fe.nama} />
      </FormField>
      <FormField label="NIK (16 digit)" required>
        <Input name="nik" required defaultValue={v('nik', d.nik ?? '')} invalid={!!fe.nik} placeholder="3200000000000000" />
        <FieldError msg={fe.nik} />
      </FormField>
      <FormField label="NPWP (15-16 digit)">
        <Input name="npwp" defaultValue={v('npwp', d.npwp ?? '')} invalid={!!fe.npwp} placeholder="01.234.567.8-501.000" />
        <FieldError msg={fe.npwp} />
      </FormField>
      <FormField label="PTKP" required>
        <Select name="ptkpStatus" required defaultValue={v('ptkpStatus', d.ptkpStatus ?? 'TK_0')} invalid={!!fe.ptkpStatus} className="font-mono">
          {(Object.keys(PTKP_LABEL) as Ptkp[]).map((p) => (
            <option key={p} value={p}>{PTKP_LABEL[p]}</option>
          ))}
        </Select>
        <FieldError msg={fe.ptkpStatus} />
      </FormField>
      <FormField label="Cabang">
        <Select name="cabangId" defaultValue={v('cabangId', d.cabangId ?? '')} invalid={!!fe.cabangId}>
          <option value="">—</option>
          {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
        </Select>
        <FieldError msg={fe.cabangId} />
      </FormField>
      <FormField label="Jabatan">
        <Input name="jabatan" defaultValue={v('jabatan', d.jabatan ?? '')} placeholder="Staf …" />
      </FormField>
      <FormField label="Tanggal masuk" required>
        <Input name="tanggalMasuk" type="date" required defaultValue={v('tanggalMasuk', d.tanggalMasuk ?? '2024-01-01')} invalid={!!fe.tanggalMasuk} />
        <FieldError msg={fe.tanggalMasuk} />
      </FormField>
      <FormField label="Gaji pokok" required>
        <Input name="gajiPokok" type="number" required defaultValue={v('gajiPokok', d.gajiPokok ?? '0')} invalid={!!fe.gajiPokok} />
        <FieldError msg={fe.gajiPokok} />
      </FormField>
      <FormField label="Tunjangan tetap">
        <Input name="tunjanganTetap" type="number" defaultValue={v('tunjanganTetap', d.tunjanganTetap ?? '0')} invalid={!!fe.tunjanganTetap} />
        <FieldError msg={fe.tunjanganTetap} />
      </FormField>
      <FormField label="Iuran BPJS karyawan">
        <Input name="iuranBpjsKaryawan" type="number" defaultValue={v('iuranBpjsKaryawan', d.iuranBpjsKaryawan ?? '0')} invalid={!!fe.iuranBpjsKaryawan} />
        <FieldError msg={fe.iuranBpjsKaryawan} />
      </FormField>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Menyimpan…' : (submitLabel ?? 'Simpan')}
      </Button>
    </form>
  );
}
