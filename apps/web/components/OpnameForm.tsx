'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

interface Item { id: string; kode: string; nama: string; satuan: string; isAktif: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface SaldoRow {
  item: { id: string; kode: string; nama: string; satuan: string };
  cabang: { id: string; kode: string };
  qty: string;
  nilai: string;
}

interface Line {
  itemId: string;
  itemNama: string;
  satuan: string;
  qtySaatIni: string;
  qtyFisik: string;
  hargaPokok: string;
  keterangan: string;
}

export interface OpnameDefaultValues {
  tanggal: string;
  cabangId: string;
  alasan: string;
  lines: Line[];
}

interface OpnameFormProps {
  items: Item[];
  cabang: Cabang[];
  saldoMap: Record<string, SaldoRow[]>; // cabangId → saldoRows
  submit: (formData: FormData) => Promise<void>;
  defaultValues?: OpnameDefaultValues;
  redirectTo?: string;
  submitLabel?: string;
}

export function OpnameForm({
  items, cabang, saldoMap, submit, defaultValues, redirectTo, submitLabel,
}: OpnameFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  const [alasan, setAlasan] = useState(defaultValues?.alasan ?? 'Opname akhir bulan');
  const [lines, setLines] = useState<Line[]>(defaultValues?.lines ?? []);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Pre-fill: setiap kali cabang berubah, populasi lines dari saldo cabang itu.
  // Di mode edit (defaultValues ada), skip pre-fill — kita pakai defaultValues lines.
  useEffect(() => {
    if (defaultValues) return;
    const saldo = saldoMap[cabangId] ?? [];
    const next: Line[] = saldo.map((s) => {
      const qty = Number(s.qty);
      const nilai = Number(s.nilai);
      const rata = qty > 0 ? nilai / qty : 0;
      return {
        itemId: s.item.id,
        itemNama: `${s.item.kode}  ${s.item.nama}`,
        satuan: s.item.satuan,
        qtySaatIni: s.qty,
        qtyFisik: s.qty, // default = saldo sekarang (tidak ada penyesuaian)
        hargaPokok: String(rata),
        keterangan: '',
      };
    });
    setLines(next);
  }, [cabangId, saldoMap, defaultValues]);

  const updLine = (i: number, p: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...p } : l)));

  const addItemRow = (itemId: string) => {
    if (lines.some((l) => l.itemId === itemId)) return;
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    setLines((p) => [...p, {
      itemId: it.id,
      itemNama: `${it.kode}  ${it.nama}`,
      satuan: it.satuan,
      qtySaatIni: '0',
      qtyFisik: '0',
      hargaPokok: '0',
      keterangan: '',
    }]);
  };

  const removeLine = (i: number) =>
    setLines((p) => p.filter((_, k) => k !== i));

  const totalDelta = lines.reduce((a, l) => {
    const d = Number(l.qtyFisik) - Number(l.qtySaatIni);
    return a + d * Number(l.hargaPokok);
  }, 0);

  const totalPlus = lines.filter((l) => Number(l.qtyFisik) > Number(l.qtySaatIni)).length;
  const totalMinus = lines.filter((l) => Number(l.qtyFisik) < Number(l.qtySaatIni)).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cabangId) { setError('Pilih cabang'); return; }
    const filtered = lines.filter((l) =>
      Number(l.qtyFisik) !== Number(l.qtySaatIni)
    );
    if (filtered.length === 0) {
      setError('Tidak ada baris yang berubah — tidak perlu opname.');
      return;
    }
    const payload = {
      cabangId,
      tanggal,
      alasan,
      lines: filtered.map((l) => ({
        itemId: l.itemId,
        qtyFisik: l.qtyFisik,
        keterangan: l.keterangan || undefined,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        await submit(fd);
        router.push((redirectTo ?? '/persediaan/penyesuaian') as Route);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tanggal Opname</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang</label>
            {cabang.length <= 1 ? (
              <div className="w-full px-2.5 py-2 bg-cream-100 border border-cream-300 rounded-md text-sm text-tanah-700">
                {cabang[0] ? `${cabang[0].kode} — ${cabang[0].nama}` : '—'}
              </div>
            ) : (
              <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} required
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Alasan</label>
            <input type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)} required
              placeholder="Opname akhir Mei 2026"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-50 text-left">
            <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
              <th className="px-3 py-2 font-bold w-8">#</th>
              <th className="px-3 py-2 font-bold">Item</th>
              <th className="px-3 py-2 font-bold text-right w-32">Qty Pencatatan</th>
              <th className="px-3 py-2 font-bold text-right w-32">Qty Fisik</th>
              <th className="px-3 py-2 font-bold text-right w-24">Δ Qty</th>
              <th className="px-3 py-2 font-bold text-right w-32">Δ Nilai</th>
              <th className="px-3 py-2 font-bold">Keterangan</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {lines.map((l, i) => {
              const dQty = Number(l.qtyFisik) - Number(l.qtySaatIni);
              const dNilai = dQty * Number(l.hargaPokok);
              return (
                <tr key={i} className={dQty !== 0 ? 'bg-emas-100/30' : ''}>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{l.itemNama}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs text-tanah-500">
                    {Number(l.qtySaatIni).toLocaleString('id-ID')} {l.satuan}
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" min={0} step="0.0001" value={l.qtyFisik}
                      onChange={(e) => updLine(i, { qtyFisik: e.target.value })}
                      className="w-full px-2 py-1 bg-cream-50 border border-cream-300 rounded text-xs text-right font-mono" />
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-xs ${dQty < 0 ? 'text-bata-700' : dQty > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>
                    {dQty !== 0 && (dQty > 0 ? '+' : '')}{dQty.toLocaleString('id-ID')}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-xs ${dNilai < 0 ? 'text-bata-700' : dNilai > 0 ? 'text-padi-700' : 'text-tanah-400'}`}>
                    {dNilai !== 0 && (dNilai > 0 ? '+' : '')}{dNilai.toLocaleString('id-ID')}
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="text" value={l.keterangan}
                      onChange={(e) => updLine(i, { keterangan: e.target.value })}
                      placeholder="(opsional)"
                      className="w-full px-2 py-1 bg-cream-50 border border-cream-300 rounded text-xs" />
                  </td>
                  <td className="px-1 text-center">
                    <button type="button" onClick={() => removeLine(i)}
                      className="text-tanah-300 hover:text-bata-500">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="bg-cream-50 px-3 py-2 border-t border-cream-200 flex items-center gap-2">
          <select onChange={(e) => { if (e.target.value) addItemRow(e.target.value); e.target.value = ''; }}
            className="text-xs px-2 py-1.5 bg-white border border-cream-300 rounded-md text-tanah-700">
            <option value="">+ Tambah item lain…</option>
            {items.filter((i) => i.isAktif && !lines.some((l) => l.itemId === i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.kode}  {i.nama}</option>
            ))}
          </select>
          <span className="text-xs text-tanah-500 ml-auto">
            {totalPlus > 0 && <span className="text-padi-700 mr-3">+{totalPlus} item lebih</span>}
            {totalMinus > 0 && <span className="text-bata-700">-{totalMinus} item kurang</span>}
          </span>
        </div>
      </section>

      <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between ${
        totalDelta === 0 ? 'bg-cream-50 text-tanah-500' :
        totalDelta > 0 ? 'bg-padi-100 text-padi-700' : 'bg-bata-100 text-bata-700'
      }`}>
        <span>
          Total selisih nilai persediaan:{' '}
          <span className="font-mono tabular-nums text-base">
            {totalDelta >= 0 ? '+' : ''}Rp {Math.abs(totalDelta).toLocaleString('id-ID')}
          </span>
        </span>
        <div className="flex gap-2 items-center">
          {error && <span className="text-bata-700 text-xs">{error}</span>}
          <button type="submit" disabled={submitting}
            className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 text-cream-50 rounded-lg text-sm font-semibold">
            {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
          </button>
        </div>
      </div>
    </form>
  );
}
