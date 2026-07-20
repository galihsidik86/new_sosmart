'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Button, FilterBar, Input, Select, StatusBanner,
  Table, THead, TH, TBody, TR, TD, EmptyRow,
} from '@/components/ui';

export interface AkunFiskalRow {
  id: string;
  kode: string;
  nama: string;
  kind: string;
  fiskalTreatment: string;
  fiskalPersen: string | null;
  fiskalKategori: string | null;
}

export interface FiskalItem {
  accountId: string;
  fiskalTreatment: string;
  fiskalPersen: string | null;
  fiskalKategori: string | null;
}

const TREATMENT_LABEL: Record<string, string> = {
  NONE: '— tak dikoreksi',
  NON_DEDUCTIBLE: 'Non-deductible (koreksi +)',
  PARTIAL: 'Sebagian deductible (koreksi + sisa)',
  FINAL_INCOME: 'Penghasilan final (koreksi −)',
  NON_OBJECT: 'Bukan objek pajak (koreksi −)',
  CADANGAN: 'Cadangan/penyisihan (koreksi +)',
};
const KATEGORI_LABEL: Record<string, string> = {
  NATURA: 'Natura/kenikmatan',
  ENTERTAINMENT: 'Entertainment',
  SUMBANGAN: 'Sumbangan',
  SANKSI_PAJAK: 'Sanksi pajak',
  PENGHASILAN_FINAL: 'Penghasilan final',
  BUNGA: 'Bunga',
  SEWA: 'Sewa',
  PENYUSUTAN: 'Penyusutan',
  CADANGAN: 'Cadangan',
  LAINNYA: 'Lainnya',
};

type Edit = { fiskalTreatment: string; fiskalPersen: string; fiskalKategori: string };

export function AtributFiskalTable({
  rows,
  action,
}: {
  rows: AkunFiskalRow[];
  action: (items: FiskalItem[]) => Promise<void>;
}) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          r.id,
          {
            fiskalTreatment: r.fiskalTreatment,
            fiskalPersen: r.fiskalPersen ?? '',
            fiskalKategori: r.fiskalKategori ?? '',
          } as Edit,
        ]),
      ),
    [rows],
  );
  const [edits, setEdits] = useState<Record<string, Edit>>(initial);
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const upd = (id: string, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const isDirty = (id: string) => {
    const a = initial[id]!;
    const b = edits[id]!;
    return (
      a.fiskalTreatment !== b.fiskalTreatment ||
      (b.fiskalTreatment === 'PARTIAL' && a.fiskalPersen !== b.fiskalPersen) ||
      a.fiskalKategori !== b.fiskalKategori
    );
  };
  const dirtyCount = rows.filter((r) => isDirty(r.id)).length;

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => r.kode.toLowerCase().includes(s) || r.nama.toLowerCase().includes(s));
  }, [rows, q]);

  const save = () => {
    const items: FiskalItem[] = rows
      .filter((r) => isDirty(r.id))
      .map((r) => {
        const e = edits[r.id]!;
        return {
          accountId: r.id,
          fiskalTreatment: e.fiskalTreatment,
          fiskalPersen: e.fiskalTreatment === 'PARTIAL' ? e.fiskalPersen || '0' : null,
          fiskalKategori: e.fiskalTreatment === 'NONE' ? null : e.fiskalKategori || null,
        };
      });
    if (items.length === 0) return;
    setSavedMsg(null);
    startTransition(async () => {
      await action(items);
      setSavedMsg(`${items.length} akun diperbarui.`);
    });
  };

  return (
    <>
      <FilterBar>
        <Input
          placeholder="Cari kode / nama akun…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          className="min-w-[240px]"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-tanah-500">
            {rows.length} akun{dirtyCount > 0 ? ` · ${dirtyCount} diubah` : ''}
          </span>
          <Button size="sm" onClick={save} disabled={pending || dirtyCount === 0}>
            {pending ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        </div>
      </FilterBar>

      {savedMsg && (
        <div className="mb-3">
          <StatusBanner tone="success">✓ {savedMsg}</StatusBanner>
        </div>
      )}

      <Table>
        <THead>
          <TH className="w-24">Kode</TH>
          <TH>Nama akun</TH>
          <TH className="w-64">Perlakuan fiskal</TH>
          <TH className="w-20" numeric>% deduct.</TH>
          <TH className="w-44">Kategori</TH>
        </THead>
        <TBody>
          {filtered.map((r) => {
            const e = edits[r.id]!;
            const dirty = isDirty(r.id);
            return (
              <TR key={r.id} className={dirty ? 'bg-cream-100' : undefined}>
                <TD className="font-mono text-tanah-700">{r.kode}</TD>
                <TD>
                  <div className="font-semibold text-tanah-700">{r.nama}</div>
                  <div className="text-[10px] uppercase tracking-wide text-tanah-500">{r.kind}</div>
                </TD>
                <TD>
                  <Select
                    value={e.fiskalTreatment}
                    onChange={(ev) => upd(r.id, { fiskalTreatment: ev.target.value })}
                  >
                    {Object.entries(TREATMENT_LABEL).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  {e.fiskalTreatment === 'PARTIAL' ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      numeric
                      value={e.fiskalPersen}
                      onChange={(ev) => upd(r.id, { fiskalPersen: ev.target.value })}
                      placeholder="50"
                    />
                  ) : (
                    <span className="text-tanah-300 text-xs">—</span>
                  )}
                </TD>
                <TD>
                  {e.fiskalTreatment === 'NONE' ? (
                    <span className="text-tanah-300 text-xs">—</span>
                  ) : (
                    <Select
                      value={e.fiskalKategori}
                      onChange={(ev) => upd(r.id, { fiskalKategori: ev.target.value })}
                    >
                      <option value="">— pilih —</option>
                      {Object.entries(KATEGORI_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </Select>
                  )}
                </TD>
              </TR>
            );
          })}
          {filtered.length === 0 && (
            <EmptyRow colSpan={5}>{rows.length === 0 ? 'Belum ada akun beban/pendapatan.' : 'Tak ada akun cocok.'}</EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
