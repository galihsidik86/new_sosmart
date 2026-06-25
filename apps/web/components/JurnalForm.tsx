'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Account {
  id: string;
  kode: string;
  nama: string;
  isPostable: boolean;
  normalBalance: 'DEBIT' | 'KREDIT';
}
interface Cabang { id: string; kode: string; nama: string }

interface Line {
  accountId: string;
  debit: string;
  kredit: string;
  deskripsi: string;
}

interface JurnalFormProps {
  accounts: Account[];
  cabang: Cabang[];
  /** Server action: terima FormData berisi JSON di field 'payload'. */
  submit: (formData: FormData) => Promise<void>;
}

const TEMPLATES: Array<{ label: string; desc: string; lines: Array<{ kode: string; d?: number; k?: number; ket: string }> }> = [
  {
    label: 'Penjualan tunai barang',
    desc: 'Penjualan tunai barang dagang',
    lines: [
      { kode: '1-101', d: 11100000, ket: 'Penerimaan kas' },
      { kode: '4-101', k: 10000000, ket: 'Pendapatan penjualan' },
      { kode: '2-1021', k: 1100000, ket: 'PPN keluaran 11%' },
    ],
  },
  {
    label: 'Pembelian persediaan',
    desc: 'Pembelian persediaan barang',
    lines: [
      { kode: '1-104', d: 5000000, ket: 'Persediaan' },
      { kode: '1-105', d: 550000, ket: 'PPN masukan 11%' },
      { kode: '1-1021', k: 5550000, ket: 'Bayar via bank' },
    ],
  },
  {
    label: 'Bayar gaji + PPh 21',
    desc: 'Pembayaran gaji karyawan bulan berjalan',
    lines: [
      { kode: '6-101', d: 20000000, ket: 'Beban gaji' },
      { kode: '2-1022', k: 600000, ket: 'PPh 21 yg dipotong' },
      { kode: '1-1021', k: 19400000, ket: 'Transfer ke karyawan' },
    ],
  },
];

export function JurnalForm({ accounts, cabang, submit }: JurnalFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [deskripsi, setDeskripsi] = useState('');
  const [cabangId, setCabangId] = useState(cabang[0]?.id ?? '');
  const [lines, setLines] = useState<Line[]>([
    { accountId: '', debit: '0', kredit: '0', deskripsi: '' },
    { accountId: '', debit: '0', kredit: '0', deskripsi: '' },
  ]);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const totals = useMemo(() => {
    const td = lines.reduce((a, l) => a + Number(l.debit || 0), 0);
    const tk = lines.reduce((a, l) => a + Number(l.kredit || 0), 0);
    return { td, tk, diff: td - tk, balanced: Math.abs(td - tk) < 0.005 && td > 0 };
  }, [lines]);

  const postable = useMemo(
    () => accounts.filter((a) => a.isPostable),
    [accounts],
  );

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((p) => [...p, { accountId: '', debit: '0', kredit: '0', deskripsi: '' }]);

  const removeLine = (i: number) =>
    setLines((p) => (p.length <= 2 ? p : p.filter((_, k) => k !== i)));

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setDeskripsi(tpl.desc);
    setLines(
      tpl.lines.map((l) => {
        const acc = postable.find((a) => a.kode === l.kode);
        return {
          accountId: acc?.id ?? '',
          debit: l.d ? String(l.d) : '0',
          kredit: l.k ? String(l.k) : '0',
          deskripsi: l.ket,
        };
      }),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!totals.balanced) {
      setError('Total debit dan kredit harus seimbang dan > 0');
      return;
    }
    if (!cabangId) {
      setError('Pilih cabang');
      return;
    }
    const payload = {
      cabangId,
      tanggal,
      deskripsi,
      sumber: 'MANUAL' as const,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: String(Number(l.debit || 0)),
        kredit: String(Number(l.kredit || 0)),
        deskripsi: l.deskripsi || undefined,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        await submit(fd);
        router.push('/pembukuan/jurnal');
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
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Tanggal
            </label>
            <input
              type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Cabang
            </label>
            <select
              value={cabangId} onChange={(e) => setCabangId(e.target.value)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
              required
            >
              {cabang.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kode} — {c.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="col-start-1 col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Deskripsi
            </label>
            <input
              type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Penjualan tunai barang dagang"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm"
              required
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="text-xs text-tanah-500 self-center">Template cepat:</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.label} type="button" onClick={() => applyTemplate(t)}
              className="text-xs px-2.5 py-1.5 bg-cream-100 border border-cream-300 rounded-md text-tanah-700 hover:bg-cream-200"
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-50 text-left">
            <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
              <th className="px-3 py-2.5 font-bold w-8">#</th>
              <th className="px-3 py-2.5 font-bold">Akun</th>
              <th className="px-3 py-2.5 font-bold">Keterangan baris</th>
              <th className="px-3 py-2.5 font-bold text-right w-40">Debit</th>
              <th className="px-3 py-2.5 font-bold text-right w-40">Kredit</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 text-xs text-tanah-500 tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={l.accountId}
                    onChange={(e) => updateLine(i, { accountId: e.target.value })}
                    required
                    className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono"
                  >
                    <option value="">— pilih akun —</option>
                    {postable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kode}  {a.nama}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text" value={l.deskripsi}
                    onChange={(e) => updateLine(i, { deskripsi: e.target.value })}
                    placeholder="(opsional)"
                    className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number" min={0} step="0.01" value={l.debit}
                    onChange={(e) => updateLine(i, { debit: e.target.value, kredit: '0' })}
                    className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono tabular-nums"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number" min={0} step="0.01" value={l.kredit}
                    onChange={(e) => updateLine(i, { kredit: e.target.value, debit: '0' })}
                    className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono tabular-nums"
                  />
                </td>
                <td className="px-2 text-center">
                  <button
                    type="button" onClick={() => removeLine(i)}
                    disabled={lines.length <= 2}
                    className="text-tanah-300 hover:text-bata-500 disabled:opacity-30"
                    title="Hapus baris"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-cream-300 bg-cream-50">
              <td colSpan={3} className="px-3 py-2.5">
                <button
                  type="button" onClick={addLine}
                  className="text-xs px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-tanah-700 hover:bg-cream-100"
                >
                  + Tambah baris
                </button>
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-tanah-700">
                {totals.td.toLocaleString('id-ID')}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-tanah-700">
                {totals.tk.toLocaleString('id-ID')}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <div
        className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between ${
          totals.balanced
            ? 'bg-padi-100 text-padi-700'
            : totals.td > 0 || totals.tk > 0
            ? 'bg-bata-100 text-bata-700'
            : 'bg-cream-50 text-tanah-500'
        }`}
      >
        <span>
          {totals.balanced
            ? '✓ Seimbang — siap diposting'
            : totals.td === totals.tk
            ? 'Isi nominal debit & kredit dulu'
            : `Belum seimbang — selisih Rp ${Math.abs(totals.diff).toLocaleString('id-ID')}`}
        </span>
        <div className="flex gap-2">
          {error && <span className="text-bata-700 text-xs">{error}</span>}
          <button
            type="submit" disabled={submitting || !totals.balanced}
            className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 disabled:cursor-not-allowed text-cream-50 rounded-lg text-sm font-semibold"
          >
            {submitting ? 'Menyimpan…' : 'Simpan sebagai DRAFT'}
          </button>
        </div>
      </div>
    </form>
  );
}
