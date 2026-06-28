'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

type Tipe = 'RECEIPT' | 'PAYMENT' | 'TRANSFER';

interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface InvoiceSummary {
  id: string; nomor: string | null; vendorOrCustomer: string;
  totalNetto: string; totalDibayar: string;
}

interface Line {
  accountId: string;
  nilai: string;
  deskripsi: string;
}

export interface CashBankDefaultValues {
  tanggal: string;
  tipe: Tipe;
  cabangId: string;
  akunKasBankId: string;
  akunKasBankLawanId?: string;
  total: string;
  kontak?: string;
  deskripsi?: string;
  salesInvoiceId?: string;
  purchaseInvoiceId?: string;
  lines: Line[];
}

interface CashBankFormProps {
  cabang: Cabang[];
  accounts: Account[];
  kasBank: Account[];
  openSales: InvoiceSummary[];
  openPurchases: InvoiceSummary[];
  submit: (formData: FormData) => Promise<void>;
  defaultValues?: CashBankDefaultValues;
  redirectTo?: string;
  submitLabel?: string;
}

export function CashBankForm({
  cabang, accounts, kasBank, openSales, openPurchases, submit,
  defaultValues, redirectTo, submitLabel,
}: CashBankFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [tipe, setTipe] = useState<Tipe>(defaultValues?.tipe ?? 'RECEIPT');
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  const [akunKasBankId, setAkunKasBankId] = useState(defaultValues?.akunKasBankId ?? kasBank[0]?.id ?? '');
  const [akunKasBankLawanId, setAkunKasBankLawanId] = useState(defaultValues?.akunKasBankLawanId ?? kasBank[1]?.id ?? '');
  const [total, setTotal] = useState(defaultValues?.total ?? '0');
  const [kontak, setKontak] = useState(defaultValues?.kontak ?? '');
  const [deskripsi, setDeskripsi] = useState(defaultValues?.deskripsi ?? '');
  const [salesInvoiceId, setSalesInvoiceId] = useState(defaultValues?.salesInvoiceId ?? '');
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState(defaultValues?.purchaseInvoiceId ?? '');
  const [lines, setLines] = useState<Line[]>(
    defaultValues?.lines ?? [{ accountId: '', nilai: '0', deskripsi: '' }],
  );
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const updLine = (i: number, p: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const addLine = () =>
    setLines((p) => [...p, { accountId: '', nilai: '0', deskripsi: '' }]);
  const removeLine = (i: number) =>
    setLines((p) => (p.length <= 1 ? p : p.filter((_, k) => k !== i)));

  const sumLines = useMemo(
    () => lines.reduce((a, l) => a + Number(l.nilai || 0), 0),
    [lines],
  );
  const totalNum = Number(total || 0);
  const balanced = tipe === 'TRANSFER' || Math.abs(sumLines - totalNum) < 0.005;

  // Quick template: pelunasan piutang
  const applyPelunasanPiutang = (inv: InvoiceSummary, akunPiutangPlaceholder?: string) => {
    setTipe('RECEIPT');
    const sisa = Number(inv.totalNetto) - Number(inv.totalDibayar);
    setTotal(String(sisa));
    setKontak(inv.vendorOrCustomer);
    setDeskripsi(`Pelunasan ${inv.nomor}`);
    setSalesInvoiceId(inv.id);
    setPurchaseInvoiceId('');
    // Akun piutang biasanya 1-103, tapi user harus pilih akun lawan.
    const ar = accounts.find((a) => a.kode === '1-103');
    setLines([{ accountId: ar?.id ?? '', nilai: String(sisa), deskripsi: `Pelunasan ${inv.nomor}` }]);
  };
  const applyPelunasanUtang = (inv: InvoiceSummary) => {
    setTipe('PAYMENT');
    const sisa = Number(inv.totalNetto) - Number(inv.totalDibayar);
    setTotal(String(sisa));
    setKontak(inv.vendorOrCustomer);
    setDeskripsi(`Bayar utang ${inv.nomor}`);
    setPurchaseInvoiceId(inv.id);
    setSalesInvoiceId('');
    const ap = accounts.find((a) => a.kode === '2-101');
    setLines([{ accountId: ap?.id ?? '', nilai: String(sisa), deskripsi: `Bayar utang ${inv.nomor}` }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!balanced) {
      setError('Jumlah baris tidak sama dengan total transaksi.');
      return;
    }
    if (tipe === 'TRANSFER' && akunKasBankId === akunKasBankLawanId) {
      setError('Akun asal dan tujuan transfer harus berbeda.');
      return;
    }
    const payload: Record<string, unknown> = {
      cabangId,
      tipe,
      tanggal,
      akunKasBankId,
      total: String(totalNum),
      kontak: kontak || undefined,
      deskripsi: deskripsi || undefined,
      lines: tipe === 'TRANSFER' ? [] : lines.map((l) => ({
        accountId: l.accountId,
        nilai: l.nilai,
        deskripsi: l.deskripsi || undefined,
      })),
    };
    if (tipe === 'TRANSFER') payload.akunKasBankLawanId = akunKasBankLawanId;
    if (salesInvoiceId) payload.salesInvoiceId = salesInvoiceId;
    if (purchaseInvoiceId) payload.purchaseInvoiceId = purchaseInvoiceId;

    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        await submit(fd);
        router.push((redirectTo ?? '/transaksi/kas-bank') as Route);
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
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tipe</label>
            <select value={tipe} onChange={(e) => setTipe(e.target.value as Tipe)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              <option value="RECEIPT">RECEIPT — kas/bank masuk (BKM/BBM)</option>
              <option value="PAYMENT">PAYMENT — kas/bank keluar (BKK/BBK)</option>
              <option value="TRANSFER">TRANSFER — mutasi antar akun</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tanggal</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang</label>
            {cabang.length <= 1 ? (
              <div className="w-full px-2.5 py-2 bg-cream-100 border border-cream-300 rounded-md text-sm text-tanah-700">
                {cabang[0] ? `${cabang[0].kode} — ${cabang[0].nama}` : '—'}
              </div>
            ) : (
              <select value={cabangId} onChange={(e) => setCabangId(e.target.value)}
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
              Akun Kas/Bank {tipe === 'TRANSFER' ? '(dari)' : ''}
            </label>
            <select value={akunKasBankId} onChange={(e) => setAkunKasBankId(e.target.value)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
              {kasBank.map((a) => (
                <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
              ))}
            </select>
          </div>
          {tipe === 'TRANSFER' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Tujuan</label>
              <select value={akunKasBankLawanId} onChange={(e) => setAkunKasBankLawanId(e.target.value)}
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
                {kasBank.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Total (Rp)</label>
            <input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} required
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm text-right font-mono tabular-nums" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Kontak (pihak transaksi)</label>
            <input type="text" value={kontak} onChange={(e) => setKontak(e.target.value)}
              placeholder="(opsional)"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Deskripsi</label>
            <input type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="(opsional)"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
        </div>

        {(openSales.length > 0 || openPurchases.length > 0) && (
          <div className="mt-4 pt-4 border-t border-cream-200">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">
              Template: pelunasan faktur belum lunas
            </div>
            <div className="flex flex-wrap gap-1.5">
              {openSales.slice(0, 5).map((inv) => (
                <button key={inv.id} type="button" onClick={() => applyPelunasanPiutang(inv)}
                  className="text-xs px-2 py-1 bg-padi-100 border border-padi-300 rounded-md text-padi-700 hover:bg-padi-300 hover:text-padi-700">
                  ← {inv.nomor} {inv.vendorOrCustomer}
                </button>
              ))}
              {openPurchases.slice(0, 5).map((inv) => (
                <button key={inv.id} type="button" onClick={() => applyPelunasanUtang(inv)}
                  className="text-xs px-2 py-1 bg-bata-100 border border-bata-300 rounded-md text-bata-700 hover:bg-bata-300 hover:text-bata-700">
                  → {inv.nomor} {inv.vendorOrCustomer}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {tipe !== 'TRANSFER' && (
        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold w-8">#</th>
                <th className="px-3 py-2 font-bold">Akun Lawan</th>
                <th className="px-3 py-2 font-bold">Keterangan</th>
                <th className="px-3 py-2 font-bold text-right w-44">Nilai</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-xs text-tanah-500">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <select value={l.accountId} onChange={(e) => updLine(i, { accountId: e.target.value })}
                      required
                      className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded text-sm font-mono">
                      <option value="">— pilih akun —</option>
                      {accounts.filter((a) => a.isPostable).map((a) => (
                        <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="text" value={l.deskripsi} onChange={(e) => updLine(i, { deskripsi: e.target.value })}
                      className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" min={0} step="0.01" value={l.nilai}
                      onChange={(e) => updLine(i, { nilai: e.target.value })}
                      className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded text-sm text-right font-mono tabular-nums" />
                  </td>
                  <td className="px-2 text-center">
                    <button type="button" onClick={() => removeLine(i)}
                      disabled={lines.length <= 1}
                      className="text-tanah-300 hover:text-bata-500 disabled:opacity-30">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream-50 font-bold text-tanah-700">
              <tr>
                <td colSpan={3} className="px-3 py-2">
                  <button type="button" onClick={addLine}
                    className="text-xs px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-tanah-700 hover:bg-cream-100">
                    + Tambah baris
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {sumLines.toLocaleString('id-ID')}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between ${
        balanced ? 'bg-padi-100 text-padi-700' : 'bg-bata-100 text-bata-700'
      }`}>
        <span>
          {balanced
            ? '✓ Seimbang — siap diposting'
            : `Selisih: ${(sumLines - totalNum).toLocaleString('id-ID')}`}
        </span>
        <div className="flex gap-2">
          {error && <span className="text-bata-700 text-xs">{error}</span>}
          <button type="submit" disabled={submitting || !balanced}
            className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 text-cream-50 rounded-lg text-sm font-semibold">
            {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
          </button>
        </div>
      </div>
    </form>
  );
}
