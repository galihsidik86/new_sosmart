'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtRp } from '@/lib/format';
import {
  Badge, Button, FilterBar, Input, Select,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow,
} from '@/components/ui';
import { openPrintReport } from '@/lib/print-report';

type Klasifikasi = 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';

const KLASIFIKASI_LABEL: Record<Klasifikasi, string> = {
  BKP: 'BKP (Kena PPN)',
  JKP: 'JKP (Kena PPN)',
  NON_BKP: 'Non-BKP',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  BEBAS_PPN: 'Bebas PPN',
};

export interface ItemRow {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn: Klasifikasi;
  isJasa: boolean;
  isAktif: boolean;
  pph23Tarif: { kode: string; nama: string; tarif: string } | null;
  stokAwal: Array<{ qty: string; cabang: { kode: string } }>;
}

export function ItemListView({ items, orgName }: { items: ItemRow[]; orgName: string }) {
  const [q, setQ] = useState('');
  const [klas, setKlas] = useState('');
  const [tipe, setTipe] = useState('');

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (q) {
          const s = q.toLowerCase();
          if (!it.nama.toLowerCase().includes(s) && !it.kode.toLowerCase().includes(s) && !(it.kategori ?? '').toLowerCase().includes(s)) return false;
        }
        if (klas && it.klasifikasiPpn !== klas) return false;
        if (tipe === 'jasa' && !it.isJasa) return false;
        if (tipe === 'barang' && it.isJasa) return false;
        return true;
      }),
    [items, q, klas, tipe],
  );

  const hasFilter = !!(q || klas || tipe);
  const reset = () => { setQ(''); setKlas(''); setTipe(''); };

  function cetak() {
    const criteria: string[] = [];
    if (q) criteria.push(`Pencarian: "${q}"`);
    if (klas) criteria.push(`Klasifikasi PPN: ${KLASIFIKASI_LABEL[klas as Klasifikasi]}`);
    if (tipe) criteria.push(`Tipe: ${tipe === 'jasa' ? 'Jasa' : 'Barang'}`);
    if (criteria.length === 0) criteria.push('Semua item');
    openPrintReport({
      title: 'Laporan Daftar Barang & Jasa',
      orgName,
      countLabel: 'item',
      count: filtered.length,
      criteria,
      columns: [
        { header: 'No', align: 'center' },
        { header: 'Kode', mono: true },
        { header: 'Nama', bold: true },
        { header: 'Kategori' },
        { header: 'Satuan' },
        { header: 'Klasifikasi PPN' },
        { header: 'Tipe' },
        { header: 'Harga Jual', align: 'right' },
      ],
      rows: filtered.map((it, i) => [
        String(i + 1),
        it.kode,
        it.nama,
        it.kategori ?? '—',
        it.satuan,
        KLASIFIKASI_LABEL[it.klasifikasiPpn],
        it.isJasa ? 'Jasa' : 'Barang',
        fmtRp(it.hargaJualDefault),
      ]),
    });
  }

  return (
    <>
      <FilterBar>
        <Input placeholder="Cari kode / nama / kategori…" value={q} onChange={(e) => setQ(e.target.value)} fullWidth={false} className="min-w-[210px]" />
        <Select value={klas} onChange={(e) => setKlas(e.target.value)} fullWidth={false}>
          <option value="">Semua klasifikasi PPN</option>
          {(Object.keys(KLASIFIKASI_LABEL) as Klasifikasi[]).map((k) => <option key={k} value={k}>{KLASIFIKASI_LABEL[k]}</option>)}
        </Select>
        <Select value={tipe} onChange={(e) => setTipe(e.target.value)} fullWidth={false}>
          <option value="">Barang &amp; Jasa</option>
          <option value="barang">Barang saja</option>
          <option value="jasa">Jasa saja</option>
        </Select>
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-sogan-500 hover:underline">reset filter</button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-tanah-500">{filtered.length} dari {items.length}</span>
          <Button variant="soft-sogan" size="sm" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>Cetak Laporan</Button>
        </div>
      </FilterBar>

      <Table>
        <THead>
          <TH>Kode</TH>
          <TH>Nama</TH>
          <TH>Klasifikasi PPN</TH>
          <TH numeric>Harga Jual</TH>
          <TH numeric>Stok Awal</TH>
          <TH numeric stickyEnd className="w-16" />
        </THead>
        <TBody>
          {filtered.map((it) => (
            <TR key={it.id}>
              <TD className="font-mono text-tanah-700">{it.kode}</TD>
              <TD>
                <div className="font-semibold text-tanah-700">{it.nama}</div>
                <div className="text-xs text-tanah-500">{it.kategori ?? '—'} · {it.satuan}</div>
              </TD>
              <TD>
                <Badge
                  variant={
                    it.klasifikasiPpn === 'BKP_STRATEGIS'
                      ? 'success'
                      : it.klasifikasiPpn === 'NON_BKP' || it.klasifikasiPpn === 'BEBAS_PPN'
                      ? 'neutral'
                      : 'brand'
                  }
                  size="sm"
                >
                  {KLASIFIKASI_LABEL[it.klasifikasiPpn]}
                </Badge>
                {it.isJasa && <span className="ml-2 text-[10px] text-emas-700 font-semibold uppercase">Jasa</span>}
                {it.pph23Tarif && (
                  <span className="ml-1 text-[10px] font-mono text-bata-700 bg-bata-50 border border-bata-200 rounded px-1.5 py-0.5" title={it.pph23Tarif.nama}>
                    PPh23 {Number(it.pph23Tarif.tarif)}%
                  </span>
                )}
              </TD>
              <MoneyCell className="text-tanah-700">{fmtRp(it.hargaJualDefault)}</MoneyCell>
              <TD className="text-right text-tanah-500 tabular-nums">
                {it.stokAwal[0]?.qty
                  ? `${Number(it.stokAwal[0].qty).toLocaleString('id-ID')} · ${it.stokAwal[0].cabang.kode}`
                  : '—'}
              </TD>
              <TD stickyEnd className="text-right">
                <RowActions>
                  <Link href={`/master/barang/${it.id}/edit`} className="text-xs text-sogan-500 font-semibold hover:underline">Edit</Link>
                </RowActions>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={6}>{items.length === 0 ? 'Belum ada barang.' : 'Tidak ada item sesuai filter.'}</EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
