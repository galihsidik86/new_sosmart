'use client';

import { useActionState } from 'react';
import { FormField, Input, Select, Textarea, Button } from '@/components/ui';
import { FieldError } from './FieldError';
import { emptyFormState, type FormState } from '@/lib/form-state';

type Status = 'PERENCANAAN' | 'AKTIF' | 'DITAHAN' | 'SELESAI' | 'DIBATALKAN';
const STATUS_LABEL: Record<Status, string> = {
  PERENCANAAN: 'Perencanaan', AKTIF: 'Aktif', DITAHAN: 'Ditahan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
};
const STATUSES: Status[] = ['PERENCANAAN', 'AKTIF', 'DITAHAN', 'SELESAI', 'DIBATALKAN'];

interface UserOpt { userId: string; nama: string }
interface CustomerOpt { id: string; kode: string; nama: string }
interface IndustriOpt { id: string; nama: string }

export interface ProjectDefaults {
  id?: string;
  kode?: string;
  nama?: string;
  deskripsi?: string | null;
  status?: Status;
  prioritas?: 'RENDAH' | 'SEDANG' | 'TINGGI';
  pjUserId?: string | null;
  customerId?: string | null;
  tanggalMulai?: string;
  tanggalSelesai?: string | null;
  budgetTotal?: string | null;
  nilaiKontrak?: string | null;
  catatan?: string | null;
}

export function ProjectForm({
  mode,
  action,
  users,
  customers,
  industriList,
  defaults,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  users: UserOpt[];
  customers: CustomerOpt[];
  industriList?: IndustriOpt[];
  defaults?: ProjectDefaults;
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
      {mode === 'create' && (
        <FormField label="Kode" required>
          <Input name="kode" required defaultValue={v('kode', d.kode ?? '')} invalid={!!fe.kode} placeholder="PRJ-001" />
          <FieldError msg={fe.kode} />
        </FormField>
      )}
      <FormField label="Nama Project" required>
        <Input name="nama" required defaultValue={v('nama', d.nama ?? '')} invalid={!!fe.nama} />
        <FieldError msg={fe.nama} />
      </FormField>
      <FormField label="Deskripsi">
        <Textarea name="deskripsi" rows={2} defaultValue={v('deskripsi', d.deskripsi ?? '')} />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Status">
          <Select name="status" defaultValue={v('status', d.status ?? 'AKTIF')}>
            {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </Select>
        </FormField>
        <FormField label="Prioritas">
          <Select name="prioritas" defaultValue={v('prioritas', d.prioritas ?? 'SEDANG')}>
            <option value="RENDAH">Rendah</option>
            <option value="SEDANG">Sedang</option>
            <option value="TINGGI">Tinggi</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Penanggung jawab (PIC)">
        <Select name="pjUserId" defaultValue={v('pjUserId', d.pjUserId ?? '')}>
          <option value="">— belum ditentukan —</option>
          {users.map((u) => <option key={u.userId} value={u.userId}>{u.nama}</option>)}
        </Select>
      </FormField>
      <FormField label="Klien / Pelanggan">
        <Select name="customerId" defaultValue={v('customerId', d.customerId ?? '')}>
          <option value="">— tanpa klien —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>)}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Tanggal Mulai" required={mode === 'create'}>
          <Input name="tanggalMulai" type="date" required={mode === 'create'} defaultValue={v('tanggalMulai', (d.tanggalMulai ?? '').slice(0, 10))} invalid={!!fe.tanggalMulai} />
          <FieldError msg={fe.tanggalMulai} />
        </FormField>
        <FormField label="Tanggal Selesai">
          <Input name="tanggalSelesai" type="date" defaultValue={v('tanggalSelesai', (d.tanggalSelesai ?? '').slice(0, 10))} invalid={!!fe.tanggalSelesai} />
          <FieldError msg={fe.tanggalSelesai} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Budget (biaya)"><Input name="budgetTotal" type="number" defaultValue={v('budgetTotal', d.budgetTotal ?? '')} invalid={!!fe.budgetTotal} placeholder="0" /></FormField>
        <FormField label="Nilai Kontrak"><Input name="nilaiKontrak" type="number" defaultValue={v('nilaiKontrak', d.nilaiKontrak ?? '')} invalid={!!fe.nilaiKontrak} placeholder="0" /></FormField>
      </div>
      {mode === 'create' && industriList && (
        <FormField label="Jenis Industri (opsional)">
          <Select name="industriId" defaultValue={v('industriId', '')}>
            <option value="">— pilih industri —</option>
            {industriList.map((i) => <option key={i.id} value={i.id}>{i.nama}</option>)}
          </Select>
        </FormField>
      )}
      {mode === 'edit' && (
        <FormField label="Catatan"><Textarea name="catatan" rows={2} defaultValue={v('catatan', d.catatan ?? '')} /></FormField>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Menyimpan…' : (submitLabel ?? (mode === 'create' ? 'Tambah Project' : 'Simpan'))}
      </Button>
    </form>
  );
}
