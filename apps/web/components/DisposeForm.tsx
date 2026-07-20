'use client';

import { useActionState } from 'react';
import { FieldError } from './FieldError';
import { CancelButton } from './CancelButton';
import { Button, MoneyInput } from '@/components/ui';
import { emptyFormState, type FormState } from '@/lib/form-state';

interface Account { id: string; kode: string; nama: string }

const lbl = 'block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1';
const inputCls = (invalid: boolean) =>
  `w-full px-2.5 py-2 bg-cream-50 border rounded-md text-sm ${invalid ? 'border-bata-500' : 'border-cream-300'}`;

export function DisposeForm({
  asetId,
  today,
  kasBank,
  action,
  cancelHref,
}: {
  asetId: string;
  today: string;
  kasBank: Account[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const fe = state.fieldErrors ?? {};
  const sv = state.values;
  const v = (k: string, fallback: string) => sv?.[k] ?? fallback;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <input type="hidden" name="id" value={asetId} />
      {!state.ok && state.message && !state.fieldErrors && (
        <div className="sm:col-span-2 px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-xs text-bata-700">
          {state.message}
        </div>
      )}
      <div>
        <label className={lbl}>Tanggal</label>
        <input type="date" name="tanggalDihentikan" required defaultValue={v('tanggalDihentikan', today)}
          className={inputCls(!!fe.tanggalDihentikan)} />
        <FieldError msg={fe.tanggalDihentikan} />
      </div>
      <div>
        <label className={lbl}>Status Baru</label>
        <select name="statusBaru" required defaultValue={v('statusBaru', 'DIJUAL')}
          className={inputCls(!!fe.statusBaru)}>
          <option value="DIJUAL">DIJUAL</option>
          <option value="RUSAK">RUSAK</option>
          <option value="PENSIUN">PENSIUN</option>
        </select>
        <FieldError msg={fe.statusBaru} />
      </div>
      <div>
        <label className={lbl}>Harga Jual (kalau DIJUAL)</label>
        <MoneyInput name="hargaJual" defaultValue={v('hargaJual', '0')} invalid={!!fe.hargaJual} />
        <FieldError msg={fe.hargaJual} />
      </div>
      <div>
        <label className={lbl}>Akun Kas/Bank Terima</label>
        <select name="akunKasBankId" defaultValue={v('akunKasBankId', '')}
          className={`${inputCls(!!fe.akunKasBankId)} font-mono`}>
          <option value="">— pilih —</option>
          {kasBank.map((a) => <option key={a.id} value={a.id}>{a.kode}  {a.nama}</option>)}
        </select>
        <FieldError msg={fe.akunKasBankId} />
      </div>
      <div className="sm:col-span-2">
        <label className={lbl}>Catatan</label>
        <input type="text" name="catatan" placeholder="(opsional)" defaultValue={v('catatan', '')}
          className={inputCls(!!fe.catatan)} />
        <FieldError msg={fe.catatan} />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        {cancelHref && <CancelButton href={cancelHref} className="" />}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? 'Memproses…' : 'Hentikan Aset (auto-jurnal)'}
        </Button>
      </div>
    </form>
  );
}
