'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtNpwp } from '@/lib/format';
import {
  Badge, Button, FilterBar, Input, Select,
  Table, THead, TH, TBody, TR, TD, RowActions, EmptyRow,
} from '@/components/ui';
import { openPrintReport } from '@/lib/print-report';

export interface VendorRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  kategori: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  isAktif: boolean;
}

const uniq = (xs: (string | null)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x))).sort();

export function VendorListView({ vendors, orgName }: { vendors: VendorRow[]; orgName: string }) {
  const [q, setQ] = useState('');
  const [pkp, setPkp] = useState('');
  const [kota, setKota] = useState('');
  const [kategori, setKategori] = useState('');

  const kotaOpts = useMemo(() => uniq(vendors.map((v) => v.kota)), [vendors]);
  const katOpts = useMemo(() => uniq(vendors.map((v) => v.kategori)), [vendors]);

  const filtered = useMemo(
    () =>
      vendors.filter((v) => {
        if (q) {
          const s = q.toLowerCase();
          if (
            !v.nama.toLowerCase().includes(s) &&
            !v.kode.toLowerCase().includes(s) &&
            !(v.npwp ?? '').includes(s)
          ) return false;
        }
        if (pkp === 'pkp' && !v.isPkp) return false;
        if (pkp === 'non' && v.isPkp) return false;
        if (kota && v.kota !== kota) return false;
        if (kategori && v.kategori !== kategori) return false;
        return true;
      }),
    [vendors, q, pkp, kota, kategori],
  );

  const hasFilter = !!(q || pkp || kota || kategori);
  const reset = () => { setQ(''); setPkp(''); setKota(''); setKategori(''); };

  function cetak() {
    const criteria: string[] = [];
    if (q) criteria.push(`Pencarian: "${q}"`);
    if (pkp) criteria.push(`Status PKP: ${pkp === 'pkp' ? 'PKP' : 'non-PKP'}`);
    if (kota) criteria.push(`Kota: ${kota}`);
    if (kategori) criteria.push(`Kategori: ${kategori}`);
    if (criteria.length === 0) criteria.push('Semua vendor');
    openPrintReport({
      title: 'Laporan Daftar Vendor',
      orgName,
      countLabel: 'vendor',
      count: filtered.length,
      criteria,
      columns: [
        { header: 'No', align: 'center' },
        { header: 'Kode', mono: true },
        { header: 'Nama', bold: true },
        { header: 'Kategori' },
        { header: 'PKP', align: 'center' },
        { header: 'NPWP', mono: true },
        { header: 'Kota' },
        { header: 'Telp' },
        { header: 'Termin', align: 'center' },
      ],
      rows: filtered.map((v, i) => [
        String(i + 1),
        v.kode,
        v.nama,
        v.kategori ?? '—',
        v.isPkp ? 'PKP' : '—',
        fmtNpwp(v.npwp),
        v.kota ?? '—',
        v.telp ?? '—',
        `${v.terminHari} hari`,
      ]),
    });
  }

  return (
    <>
      <FilterBar>
        <Input placeholder="Cari kode / nama / NPWP…" value={q} onChange={(e) => setQ(e.target.value)} fullWidth={false} className="min-w-[210px]" />
        <Select value={pkp} onChange={(e) => setPkp(e.target.value)} fullWidth={false}>
          <option value="">Semua status</option>
          <option value="pkp">PKP</option>
          <option value="non">non-PKP</option>
        </Select>
        {katOpts.length > 0 && (
          <Select value={kategori} onChange={(e) => setKategori(e.target.value)} fullWidth={false}>
            <option value="">Semua kategori</option>
            {katOpts.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        )}
        {kotaOpts.length > 0 && (
          <Select value={kota} onChange={(e) => setKota(e.target.value)} fullWidth={false}>
            <option value="">Semua kota</option>
            {kotaOpts.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        )}
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-sogan-500 hover:underline">reset filter</button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-tanah-500">{filtered.length} dari {vendors.length}</span>
          <Button variant="soft-sogan" size="sm" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>Cetak Laporan</Button>
        </div>
      </FilterBar>

      <Table>
        <THead>
          <TH>Kode</TH>
          <TH>Nama / Kategori</TH>
          <TH>NPWP</TH>
          <TH className="text-center">PKP</TH>
          <TH numeric>Termin</TH>
          <TH numeric stickyEnd className="w-16" />
        </THead>
        <TBody>
          {filtered.map((v) => (
            <TR key={v.id}>
              <TD className="font-mono text-tanah-700">{v.kode}</TD>
              <TD>
                <div className="font-semibold text-tanah-700">{v.nama}</div>
                <div className="text-xs text-tanah-500">{v.kategori ?? '—'} · {v.kota ?? '—'} · {v.telp ?? '—'}</div>
              </TD>
              <TD className="font-mono text-xs text-tanah-500">{fmtNpwp(v.npwp)}</TD>
              <TD className="text-center">
                {v.isPkp ? <Badge variant="success" size="sm">PKP</Badge> : <span className="text-[10px] text-tanah-500">non-PKP</span>}
              </TD>
              <TD className="text-right text-tanah-700 tabular-nums">{v.terminHari} hari</TD>
              <TD stickyEnd className="text-right">
                <RowActions>
                  <Link href={`/master/vendor/${v.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">Edit</Link>
                </RowActions>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={6}>{vendors.length === 0 ? 'Belum ada vendor.' : 'Tidak ada vendor sesuai filter.'}</EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
