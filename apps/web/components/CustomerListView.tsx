'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtNpwp, fmtRp } from '@/lib/format';
import {
  Badge, Button, FilterBar, Input, Select,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow,
} from '@/components/ui';
import { openPrintReport } from '@/lib/print-report';
import { exportRowsToXlsx } from '@/lib/xlsx-lite';

export interface CustomerRow {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  jenisPelanggan: { id: string; nama: string } | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
  isAktif: boolean;
}

export function CustomerListView({ customers, orgName }: { customers: CustomerRow[]; orgName: string }) {
  const [q, setQ] = useState('');
  const [jenis, setJenis] = useState('');
  const [pkp, setPkp] = useState('');

  const jenisOpts = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => { if (c.jenisPelanggan) m.set(c.jenisPelanggan.id, c.jenisPelanggan.nama); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [customers]);

  const filtered = useMemo(
    () =>
      customers.filter((c) => {
        if (q) {
          const s = q.toLowerCase();
          if (!c.nama.toLowerCase().includes(s) && !c.kode.toLowerCase().includes(s) && !(c.npwp ?? '').includes(s)) return false;
        }
        if (jenis && c.jenisPelanggan?.id !== jenis) return false;
        if (pkp === 'pkp' && !c.isPkp) return false;
        if (pkp === 'non' && c.isPkp) return false;
        return true;
      }),
    [customers, q, jenis, pkp],
  );

  const totalLimit = filtered.reduce((a, c) => a + Number(c.kreditLimit ?? 0), 0);
  const hasFilter = !!(q || jenis || pkp);
  const reset = () => { setQ(''); setJenis(''); setPkp(''); };

  function cetak() {
    const criteria: string[] = [];
    if (q) criteria.push(`Pencarian: "${q}"`);
    if (jenis) criteria.push(`Jenis pelanggan: ${jenisOpts.find(([id]) => id === jenis)?.[1] ?? ''}`);
    if (pkp) criteria.push(`Status PKP: ${pkp === 'pkp' ? 'PKP' : 'non-PKP'}`);
    if (criteria.length === 0) criteria.push('Semua pelanggan');
    openPrintReport({
      title: 'Laporan Daftar Pelanggan',
      orgName,
      countLabel: 'pelanggan',
      count: filtered.length,
      criteria,
      columns: [
        { header: 'No', align: 'center' },
        { header: 'Kode', mono: true },
        { header: 'Nama', bold: true },
        { header: 'Jenis' },
        { header: 'PKP', align: 'center' },
        { header: 'NPWP', mono: true },
        { header: 'Kota' },
        { header: 'Telp' },
        { header: 'Termin Pembayaran', align: 'center' },
        { header: 'Limit Kredit', align: 'right' },
      ],
      rows: filtered.map((c, i) => [
        String(i + 1),
        c.kode,
        c.nama,
        c.jenisPelanggan?.nama ?? '—',
        c.isPkp ? 'PKP' : '—',
        fmtNpwp(c.npwp),
        c.kota ?? '—',
        c.telp ?? '—',
        `${c.terminHari} hari`,
        fmtRp(c.kreditLimit),
      ]),
      footer: { label: `Total Limit Kredit (${filtered.length} pelanggan)`, value: fmtRp(String(totalLimit)) },
    });
  }

  function exportExcel() {
    exportRowsToXlsx(
      'daftar-pelanggan',
      'Pelanggan',
      ['No', 'Kode', 'Nama', 'Jenis', 'PKP', 'NPWP', 'Kota', 'Telp', 'Termin Pembayaran (hari)', 'Limit Kredit'],
      filtered.map((c, i) => [
        i + 1,
        c.kode,
        c.nama,
        c.jenisPelanggan?.nama ?? '',
        c.isPkp ? 'PKP' : '',
        c.npwp ? fmtNpwp(c.npwp) : '',
        c.kota ?? '',
        c.telp ?? '',
        c.terminHari,
        Number(c.kreditLimit ?? 0),
      ]),
    );
  }

  return (
    <>
      <FilterBar>
        <Input placeholder="Cari kode / nama / NPWP…" value={q} onChange={(e) => setQ(e.target.value)} fullWidth={false} className="min-w-[210px]" />
        {jenisOpts.length > 0 && (
          <Select value={jenis} onChange={(e) => setJenis(e.target.value)} fullWidth={false}>
            <option value="">Semua jenis</option>
            {jenisOpts.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
          </Select>
        )}
        <Select value={pkp} onChange={(e) => setPkp(e.target.value)} fullWidth={false}>
          <option value="">Semua status</option>
          <option value="pkp">PKP</option>
          <option value="non">non-PKP</option>
        </Select>
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-sogan-500 hover:underline">reset filter</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-tanah-500 mr-1">{filtered.length} dari {customers.length}</span>
          <Button variant="success" size="sm" onClick={exportExcel} leftIcon={<span aria-hidden>⬇</span>}>Export Excel</Button>
          <Button variant="soft-sogan" size="sm" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>Cetak Laporan</Button>
        </div>
      </FilterBar>

      <Table>
        <THead>
          <TH>Kode</TH>
          <TH>Nama / Jenis</TH>
          <TH>NPWP</TH>
          <TH numeric>Termin Pembayaran</TH>
          <TH numeric>Limit Kredit</TH>
          <TH numeric stickyEnd className="w-16" />
        </THead>
        <TBody>
          {filtered.map((c) => (
            <TR key={c.id}>
              <TD className="font-mono text-tanah-700">{c.kode}</TD>
              <TD>
                <div className="font-semibold text-tanah-700">{c.nama}</div>
                <div className="text-xs text-tanah-500 flex items-center gap-2">
                  <span>{c.jenisPelanggan?.nama ?? '—'}</span>
                  {c.isPkp && <Badge variant="success" size="sm">PKP</Badge>}
                  <span>· {c.kota ?? '—'}</span>
                </div>
              </TD>
              <TD className="font-mono text-xs text-tanah-500">{fmtNpwp(c.npwp)}</TD>
              <TD className="text-right text-tanah-700 tabular-nums">{c.terminHari} hari</TD>
              <MoneyCell className="text-tanah-700">{fmtRp(c.kreditLimit)}</MoneyCell>
              <TD stickyEnd className="text-right">
                <RowActions>
                  <Link href={`/master/pelanggan/${c.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">Edit</Link>
                </RowActions>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={6}>{customers.length === 0 ? 'Belum ada pelanggan.' : 'Tidak ada pelanggan sesuai filter.'}</EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
