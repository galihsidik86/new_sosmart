'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtNpwp, fmtRp } from '@/lib/format';
import {
  Button, FilterBar, Input, Select,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow,
} from '@/components/ui';
import { openPrintReport } from '@/lib/print-report';
import { exportRowsToXlsx } from '@/lib/xlsx-lite';

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

export interface KaryawanRow {
  id: string;
  kode: string;
  nama: string;
  nik: string;
  npwp: string | null;
  jabatan: string | null;
  ptkpStatus: Ptkp;
  gajiPokok: string;
  isActive: boolean;
  cabang: { kode: string } | null;
}

const uniq = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x))).sort();

export function KaryawanListView({ rows, orgName }: { rows: KaryawanRow[]; orgName: string }) {
  const [q, setQ] = useState('');
  const [ptkp, setPtkp] = useState('');
  const [cabang, setCabang] = useState('');

  const cabangOpts = useMemo(() => uniq(rows.map((k) => k.cabang?.kode)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((k) => {
        if (q) {
          const s = q.toLowerCase();
          if (!k.nama.toLowerCase().includes(s) && !k.kode.toLowerCase().includes(s) && !k.nik.includes(s)) return false;
        }
        if (ptkp && k.ptkpStatus !== ptkp) return false;
        if (cabang && k.cabang?.kode !== cabang) return false;
        return true;
      }),
    [rows, q, ptkp, cabang],
  );

  const totalGaji = filtered.reduce((a, k) => a + Number(k.gajiPokok ?? 0), 0);
  const hasFilter = !!(q || ptkp || cabang);
  const reset = () => { setQ(''); setPtkp(''); setCabang(''); };

  function cetak() {
    const criteria: string[] = [];
    if (q) criteria.push(`Pencarian: "${q}"`);
    if (ptkp) criteria.push(`PTKP: ${PTKP_LABEL[ptkp as Ptkp]}`);
    if (cabang) criteria.push(`Cabang: ${cabang}`);
    if (criteria.length === 0) criteria.push('Semua karyawan');
    openPrintReport({
      title: 'Laporan Daftar Karyawan',
      orgName,
      countLabel: 'karyawan',
      count: filtered.length,
      criteria,
      columns: [
        { header: 'No', align: 'center' },
        { header: 'Kode', mono: true },
        { header: 'Nama', bold: true },
        { header: 'Jabatan' },
        { header: 'PTKP', align: 'center' },
        { header: 'NIK', mono: true },
        { header: 'NPWP', mono: true },
        { header: 'Cabang', align: 'center' },
        { header: 'Gaji Pokok', align: 'right' },
      ],
      rows: filtered.map((k, i) => [
        String(i + 1),
        k.kode,
        k.nama,
        k.jabatan ?? '—',
        PTKP_LABEL[k.ptkpStatus],
        k.nik,
        k.npwp ? fmtNpwp(k.npwp) : 'tanpa NPWP',
        k.cabang?.kode ?? '—',
        fmtRp(k.gajiPokok),
      ]),
      footer: { label: `Total Gaji Pokok (${filtered.length} karyawan)`, value: fmtRp(String(totalGaji)) },
    });
  }

  function exportExcel() {
    exportRowsToXlsx(
      'daftar-karyawan',
      'Karyawan',
      ['No', 'Kode', 'Nama', 'Jabatan', 'PTKP', 'NIK', 'NPWP', 'Cabang', 'Gaji Pokok'],
      filtered.map((k, i) => [
        i + 1,
        k.kode,
        k.nama,
        k.jabatan ?? '',
        PTKP_LABEL[k.ptkpStatus],
        k.nik,
        k.npwp ? fmtNpwp(k.npwp) : '',
        k.cabang?.kode ?? '',
        Number(k.gajiPokok ?? 0),
      ]),
    );
  }

  return (
    <>
      <FilterBar>
        <Input placeholder="Cari kode / nama / NIK…" value={q} onChange={(e) => setQ(e.target.value)} fullWidth={false} className="min-w-[210px]" />
        <Select value={ptkp} onChange={(e) => setPtkp(e.target.value)} fullWidth={false} className="font-mono">
          <option value="">Semua PTKP</option>
          {(Object.keys(PTKP_LABEL) as Ptkp[]).map((p) => <option key={p} value={p}>{PTKP_LABEL[p]}</option>)}
        </Select>
        {cabangOpts.length > 0 && (
          <Select value={cabang} onChange={(e) => setCabang(e.target.value)} fullWidth={false}>
            <option value="">Semua cabang</option>
            {cabangOpts.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-sogan-500 hover:underline">reset filter</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-tanah-500 mr-1">{filtered.length} dari {rows.length}</span>
          <Button variant="success" size="sm" onClick={exportExcel} leftIcon={<span aria-hidden>⬇</span>}>Export Excel</Button>
          <Button variant="soft-sogan" size="sm" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>Cetak Laporan</Button>
        </div>
      </FilterBar>

      <Table>
        <THead>
          <TH>Kode</TH>
          <TH>Nama / Jabatan</TH>
          <TH>PTKP</TH>
          <TH>NPWP</TH>
          <TH numeric>Gaji Pokok</TH>
          <TH numeric stickyEnd className="w-16" />
        </THead>
        <TBody>
          {filtered.map((k) => (
            <TR key={k.id}>
              <TD className="font-mono text-tanah-700">{k.kode}</TD>
              <TD>
                <div className="font-semibold text-tanah-700">{k.nama}</div>
                <div className="text-xs text-tanah-500">{k.jabatan ?? '—'}</div>
              </TD>
              <TD>
                <span className="font-mono text-xs bg-cream-100 text-tanah-700 px-2 py-0.5 rounded">{PTKP_LABEL[k.ptkpStatus]}</span>
              </TD>
              <TD className="font-mono text-xs text-tanah-500">
                {k.npwp ? fmtNpwp(k.npwp) : <span className="text-bata-500">tanpa NPWP (+20%)</span>}
              </TD>
              <MoneyCell>{fmtRp(k.gajiPokok)}</MoneyCell>
              <TD stickyEnd className="text-right">
                <RowActions>
                  <Link href={`/pajak/karyawan/${k.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">Edit</Link>
                </RowActions>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={6}>{rows.length === 0 ? 'Belum ada karyawan.' : 'Tidak ada karyawan sesuai filter.'}</EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
