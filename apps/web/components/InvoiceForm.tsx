'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

type Klasifikasi = 'BKP' | 'JKP' | 'NON_BKP' | 'BKP_STRATEGIS' | 'BEBAS_PPN';

interface Item {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  hargaJualDefault: string;
  klasifikasiPpn: Klasifikasi;
  isJasa: boolean;
  akunPendapatanId: string | null;
  akunPersediaanId: string | null;
  akunBebanId: string | null;
}
interface Account {
  id: string; kode: string; nama: string; isPostable: boolean;
}
interface Cabang { id: string; kode: string; nama: string }
interface Party {
  id: string; kode: string; nama: string; isPkp: boolean;
  terminHari: number;
  akunPiutangId?: string | null;
  akunUtangId?: string | null;
}

interface Line {
  itemId: string | null;
  deskripsi: string;
  qty: string;
  satuan: string;
  hargaSatuan: string;
  diskonPersen: string;
  klasifikasiPpn: Klasifikasi;
  isJasa: boolean;
  /** Akun pendapatan (sales) atau akun debit beban/persediaan (purchase). */
  accountId: string;
}

export interface InvoiceDefaultValues {
  tanggal: string;
  partyId: string;
  cabangId: string;
  termin: 'TUNAI' | 'KREDIT';
  tarifPpn: 11 | 12;
  tarifPph23?: 0 | 2 | 15;
  potongPph23?: boolean;
  /** Untuk TUNAI: id akun kas/bank. */
  kasBankId?: string;
  deskripsi: string;
  lines: Line[];
}

interface InvoiceFormProps {
  mode: 'sales' | 'purchase';
  items: Item[];
  parties: Party[];      // customers atau vendors
  cabang: Cabang[];
  accounts: Account[];
  /** Akun kas/bank yg boleh dipakai untuk transaksi TUNAI. */
  kasBankAccounts: Account[];
  submit: (formData: FormData) => Promise<void>;
  defaultValues?: InvoiceDefaultValues;
  redirectTo?: string;
  submitLabel?: string;
}

const KL_LABEL: Record<Klasifikasi, string> = {
  BKP: 'BKP (kena PPN)',
  JKP: 'JKP (jasa, kena PPN)',
  BKP_STRATEGIS: 'BKP Strategis (0%)',
  NON_BKP: 'Non-BKP',
  BEBAS_PPN: 'Bebas PPN',
};
const PPNABLE: Klasifikasi[] = ['BKP', 'JKP'];

export function InvoiceForm({
  mode, items, parties, cabang, accounts, kasBankAccounts, submit,
  defaultValues, redirectTo, submitLabel,
}: InvoiceFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [partyId, setPartyId] = useState(defaultValues?.partyId ?? parties[0]?.id ?? '');
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  const [termin, setTermin] = useState<'TUNAI' | 'KREDIT'>(defaultValues?.termin ?? 'KREDIT');
  const [tarifPpn, setTarifPpn] = useState<11 | 12>(defaultValues?.tarifPpn ?? 11);
  const [tarifPph23, setTarifPph23] = useState<0 | 2 | 15>(defaultValues?.tarifPph23 ?? 2);
  const [potongPph23, setPotongPph23] = useState(defaultValues?.potongPph23 ?? true);
  const [kasBankId, setKasBankId] = useState(defaultValues?.kasBankId ?? kasBankAccounts[0]?.id ?? '');
  const [deskripsi, setDeskripsi] = useState(defaultValues?.deskripsi ?? '');
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [lines, setLines] = useState<Line[]>(
    defaultValues?.lines ?? [
      { itemId: null, deskripsi: '', qty: '1', hargaSatuan: '0', satuan: 'Pcs',
        diskonPersen: '0', klasifikasiPpn: 'BKP', isJasa: false, accountId: '' },
    ],
  );

  const party = parties.find((p) => p.id === partyId);
  const accountAr = party?.akunPiutangId;
  const accountAp = party?.akunUtangId;

  const updLine = (i: number, p: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...p } : l)));

  const setItem = (i: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) {
      updLine(i, { itemId: null });
      return;
    }
    const defaultAccount = mode === 'sales'
      ? it.akunPendapatanId
      : (it.isJasa ? it.akunBebanId : it.akunPersediaanId);
    updLine(i, {
      itemId: it.id,
      deskripsi: it.nama,
      satuan: it.satuan,
      hargaSatuan: mode === 'sales' ? it.hargaJualDefault : '0',
      klasifikasiPpn: it.klasifikasiPpn,
      isJasa: it.isJasa,
      accountId: defaultAccount ?? '',
    });
  };

  const addLine = () =>
    setLines((p) => [
      ...p,
      { itemId: null, deskripsi: '', qty: '1', hargaSatuan: '0', satuan: 'Pcs',
        diskonPersen: '0', klasifikasiPpn: 'BKP', isJasa: false, accountId: '' },
    ]);

  const removeLine = (i: number) =>
    setLines((p) => (p.length <= 1 ? p : p.filter((_, k) => k !== i)));

  // Compute totals
  const totals = useMemo(() => {
    let totDpp = 0, totPpn = 0, totPph23 = 0;
    const partyPkp = mode === 'purchase' ? party?.isPkp ?? false : true;
    for (const l of lines) {
      const qty = Number(l.qty || 0);
      const harga = Number(l.hargaSatuan || 0);
      const bruto = qty * harga;
      const diskon = bruto * (Number(l.diskonPersen || 0) / 100);
      const dpp = bruto - diskon;
      let ppn = 0;
      if (PPNABLE.includes(l.klasifikasiPpn) && (mode === 'sales' || partyPkp)) {
        if (tarifPpn === 11) ppn = dpp * (11 / 12) * 0.12;
        else ppn = dpp * (tarifPpn / 100);
      }
      let pph = 0;
      if (mode === 'purchase' && potongPph23 && l.isJasa && tarifPph23 > 0) {
        const eff = party?.id /* placeholder NPWP check */ ? tarifPph23 : tarifPph23 * 2;
        pph = dpp * (eff / 100);
      }
      totDpp += dpp;
      totPpn += ppn;
      totPph23 += pph;
    }
    const totNetto = mode === 'sales'
      ? totDpp + totPpn
      : totDpp + totPpn - totPph23;
    return { totDpp, totPpn, totPph23, totNetto };
  }, [lines, tarifPpn, tarifPph23, potongPph23, party, mode]);

  // Akun AR/AP yang dipakai
  const akunArOrAp = termin === 'TUNAI'
    ? kasBankId
    : mode === 'sales'
      ? (accountAr ?? '')
      : (accountAp ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!party) { setError('Pilih pihak'); return; }
    if (!cabangId) { setError('Pilih cabang'); return; }
    if (!akunArOrAp) {
      setError(`Akun ${termin === 'TUNAI' ? 'kas/bank' : (mode === 'sales' ? 'piutang' : 'utang')} belum di-set.`);
      return;
    }
    for (const l of lines) {
      if (!l.accountId) { setError('Setiap baris harus punya akun.'); return; }
      if (Number(l.qty) <= 0) { setError('Qty harus > 0.'); return; }
    }

    const payload = mode === 'sales' ? {
      cabangId,
      customerId: partyId,
      tanggal,
      termin,
      akunArId: akunArOrAp,
      deskripsi: deskripsi || undefined,
      tarifPpnPersen: tarifPpn,
      lines: lines.map((l) => ({
        itemId: l.itemId, deskripsi: l.deskripsi, qty: l.qty, satuan: l.satuan,
        hargaSatuan: l.hargaSatuan, diskonPersen: l.diskonPersen,
        klasifikasiPpn: l.klasifikasiPpn, isJasa: l.isJasa,
        akunPendapatanId: l.accountId,
      })),
    } : {
      cabangId,
      vendorId: partyId,
      tanggal,
      termin,
      akunApId: akunArOrAp,
      deskripsi: deskripsi || undefined,
      tarifPpnPersen: tarifPpn,
      tarifPph23Persen: tarifPph23,
      potongPph23,
      lines: lines.map((l) => ({
        itemId: l.itemId, deskripsi: l.deskripsi, qty: l.qty, satuan: l.satuan,
        hargaSatuan: l.hargaSatuan, diskonPersen: l.diskonPersen,
        klasifikasiPpn: l.klasifikasiPpn, isJasa: l.isJasa,
        akunDebitId: l.accountId,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        await submit(fd);
        router.push((redirectTo ?? (mode === 'sales' ? '/transaksi/penjualan' : '/transaksi/pembelian')) as Route);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const partyLabel = mode === 'sales' ? 'Pelanggan' : 'Vendor';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tanggal</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang</label>
            <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} required
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              {cabang.map((c) => (
                <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">{partyLabel}</label>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} required
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kode} — {p.nama}{p.isPkp ? ' (PKP)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Termin</label>
            <select value={termin} onChange={(e) => setTermin(e.target.value as 'TUNAI' | 'KREDIT')}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              <option value="KREDIT">KREDIT (termin {party?.terminHari ?? 0} hari)</option>
              <option value="TUNAI">TUNAI</option>
            </select>
          </div>
          {termin === 'TUNAI' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Kas/Bank</label>
              <select value={kasBankId} onChange={(e) => setKasBankId(e.target.value)}
                className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono">
                {kasBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} — {a.nama}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tarif PPN</label>
            <select value={tarifPpn} onChange={(e) => setTarifPpn(Number(e.target.value) as 11 | 12)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              <option value={11}>11% (PMK 131/2024 — DPP nilai lain)</option>
              <option value={12}>12% (BKP mewah, DPP penuh)</option>
            </select>
          </div>
          {mode === 'purchase' && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">PPh 23</label>
                <select value={tarifPph23} onChange={(e) => setTarifPph23(Number(e.target.value) as 0 | 2 | 15)}
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
                  <option value={0}>0% (tidak potong)</option>
                  <option value={2}>2% (jasa)</option>
                  <option value={15}>15% (royalti/dividen/bunga)</option>
                </select>
              </div>
              <label className="flex items-end gap-2 text-sm text-tanah-700 pb-2">
                <input type="checkbox" checked={potongPph23} onChange={(e) => setPotongPph23(e.target.checked)} />
                Potong PPh 23
              </label>
            </>
          )}
          <div className="col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Deskripsi</label>
            <input type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="(opsional)"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-cream-50 text-left">
            <tr className="text-[10px] uppercase tracking-wider text-tanah-500">
              <th className="px-2 py-2 font-bold w-6">#</th>
              <th className="px-2 py-2 font-bold w-44">Item (opsional)</th>
              <th className="px-2 py-2 font-bold">Deskripsi</th>
              <th className="px-2 py-2 font-bold w-20 text-right">Qty</th>
              <th className="px-2 py-2 font-bold w-16">Satuan</th>
              <th className="px-2 py-2 font-bold w-28 text-right">Harga</th>
              <th className="px-2 py-2 font-bold w-16 text-right">Disk%</th>
              <th className="px-2 py-2 font-bold w-32">Klasifikasi</th>
              <th className="px-2 py-2 font-bold w-44">Akun {mode === 'sales' ? 'Pendapatan' : 'Debit'}</th>
              <th className="px-2 py-2 font-bold w-28 text-right">DPP</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {lines.map((l, i) => {
              const qty = Number(l.qty || 0);
              const harga = Number(l.hargaSatuan || 0);
              const dpp = qty * harga * (1 - Number(l.diskonPersen || 0) / 100);
              return (
                <tr key={i}>
                  <td className="px-2 py-1 text-tanah-500 text-xs">{i + 1}</td>
                  <td className="px-2 py-1">
                    <select value={l.itemId ?? ''} onChange={(e) => setItem(i, e.target.value)}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs font-mono">
                      <option value="">— manual —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.kode} {it.nama}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={l.deskripsi} onChange={(e) => updLine(i, { deskripsi: e.target.value })}
                      required
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min={0} step="0.0001" value={l.qty}
                      onChange={(e) => updLine(i, { qty: e.target.value })}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs text-right font-mono" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={l.satuan} onChange={(e) => updLine(i, { satuan: e.target.value })}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min={0} step="0.01" value={l.hargaSatuan}
                      onChange={(e) => updLine(i, { hargaSatuan: e.target.value })}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs text-right font-mono" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min={0} max={100} step="0.01" value={l.diskonPersen}
                      onChange={(e) => updLine(i, { diskonPersen: e.target.value })}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs text-right font-mono" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={l.klasifikasiPpn}
                      onChange={(e) => updLine(i, { klasifikasiPpn: e.target.value as Klasifikasi })}
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs">
                      {(Object.keys(KL_LABEL) as Klasifikasi[]).map((k) => (
                        <option key={k} value={k}>{KL_LABEL[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select value={l.accountId} onChange={(e) => updLine(i, { accountId: e.target.value })}
                      required
                      className="w-full px-1.5 py-1 bg-cream-50 border border-cream-300 rounded text-xs font-mono">
                      <option value="">— pilih —</option>
                      {accounts.filter((a) => a.isPostable).map((a) => (
                        <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-xs">
                    {dpp.toLocaleString('id-ID')}
                  </td>
                  <td className="px-1 text-center">
                    <button type="button" onClick={() => removeLine(i)}
                      disabled={lines.length <= 1}
                      className="text-tanah-300 hover:text-bata-500 disabled:opacity-30">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="bg-cream-50 px-3 py-2 border-t border-cream-200">
          <button type="button" onClick={addLine}
            className="text-xs px-2.5 py-1.5 bg-white border border-cream-300 rounded-md text-tanah-700 hover:bg-cream-100">
            + Tambah baris
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">Ringkasan</div>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-tanah-500">Total DPP</dt>
              <dd className="font-mono tabular-nums">{totals.totDpp.toLocaleString('id-ID')}</dd></div>
            <div className="flex justify-between"><dt className="text-tanah-500">PPN ({tarifPpn}%)</dt>
              <dd className="font-mono tabular-nums">{totals.totPpn.toLocaleString('id-ID')}</dd></div>
            {mode === 'purchase' && (
              <div className="flex justify-between"><dt className="text-tanah-500">PPh 23 dipotong</dt>
                <dd className="font-mono tabular-nums text-bata-700">{totals.totPph23.toLocaleString('id-ID')}</dd></div>
            )}
            <div className="flex justify-between pt-2 border-t border-cream-200 font-bold text-tanah-700">
              <dt>{mode === 'sales' ? 'Total Faktur' : 'Yang dibayar ke vendor'}</dt>
              <dd className="font-mono tabular-nums text-base">Rp {totals.totNetto.toLocaleString('id-ID')}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col justify-end items-end">
          {error && <div className="text-bata-700 text-xs mb-2 max-w-sm text-right">{error}</div>}
          <button type="submit" disabled={submitting}
            className="px-4 py-2.5 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 text-cream-50 rounded-lg text-sm font-semibold">
            {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
          </button>
        </div>
      </section>
    </form>
  );
}
