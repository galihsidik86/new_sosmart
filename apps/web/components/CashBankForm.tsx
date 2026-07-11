'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Card, Button, FormField, Input, Select, StatusBanner, SectionHeader } from './ui';

type Tipe = 'RECEIPT' | 'PAYMENT' | 'TRANSFER';

interface Account { id: string; kode: string; nama: string; isPostable: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface InvoiceSummary {
  id: string; nomor: string | null; vendorOrCustomer: string;
  totalNetto: string; totalDibayar: string;
}

interface Line {
  accountId: string;
  projectId: string;
  nilai: string;
  deskripsi: string;
}
interface Project { id: string; kode: string; nama: string }

export interface CashBankDefaultValues {
  tanggal: string;
  tipe: Tipe;
  cabangId: string;
  akunKasBankId: string;
  akunKasBankLawanId?: string;
  total: string;
  kontak?: string;
  deskripsi?: string;
  linkBukti?: string;
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
  projects?: Project[];
  submit: (formData: FormData) => Promise<void>;
  defaultValues?: CashBankDefaultValues;
  redirectTo?: string;
  submitLabel?: string;
}

export function CashBankForm({
  cabang, accounts, kasBank, openSales, openPurchases, projects, submit,
  defaultValues, redirectTo, submitLabel,
}: CashBankFormProps) {
  const showProjects = !!projects && projects.length > 0;
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [tipe, setTipe] = useState<Tipe>(defaultValues?.tipe ?? 'RECEIPT');
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  const [akunKasBankId, setAkunKasBankId] = useState(defaultValues?.akunKasBankId ?? kasBank[0]?.id ?? '');
  const [akunKasBankLawanId, setAkunKasBankLawanId] = useState(defaultValues?.akunKasBankLawanId ?? kasBank[1]?.id ?? '');
  const [total, setTotal] = useState(defaultValues?.total ?? '0');
  const [kontak, setKontak] = useState(defaultValues?.kontak ?? '');
  const [deskripsi, setDeskripsi] = useState(defaultValues?.deskripsi ?? '');
  const [linkBukti, setLinkBukti] = useState(defaultValues?.linkBukti ?? '');
  const [salesInvoiceId, setSalesInvoiceId] = useState(defaultValues?.salesInvoiceId ?? '');
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState(defaultValues?.purchaseInvoiceId ?? '');
  const [lines, setLines] = useState<Line[]>(
    defaultValues?.lines ?? [{ accountId: '', projectId: '', nilai: '0', deskripsi: '' }],
  );
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const updLine = (i: number, p: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const addLine = () =>
    setLines((p) => [...p, { accountId: '', projectId: '', nilai: '0', deskripsi: '' }]);
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
    setLines([{ accountId: ar?.id ?? '', projectId: '', nilai: String(sisa), deskripsi: `Pelunasan ${inv.nomor}` }]);
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
    setLines([{ accountId: ap?.id ?? '', projectId: '', nilai: String(sisa), deskripsi: `Bayar utang ${inv.nomor}` }]);
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
      linkBukti: linkBukti.trim() || null,
      lines: tipe === 'TRANSFER' ? [] : lines.map((l) => ({
        accountId: l.accountId,
        projectId: l.projectId || null,
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
      <Card>
        <SectionHeader className="mb-4">1 · Informasi Transaksi</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Tipe">
            <Select value={tipe} onChange={(e) => setTipe(e.target.value as Tipe)}>
              <option value="RECEIPT">RECEIPT — kas/bank masuk (BKM/BBM)</option>
              <option value="PAYMENT">PAYMENT — kas/bank keluar (BKK/BBK)</option>
              <option value="TRANSFER">TRANSFER — mutasi antar akun</option>
            </Select>
          </FormField>
          <FormField label="Tanggal">
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </FormField>
          <FormField label="Cabang">
            {cabang.length <= 1 ? (
              <div className="w-full px-3 py-2 bg-cream-100 border border-cream-300 rounded-lg text-sm text-tanah-700">
                {cabang[0] ? `${cabang[0].kode} — ${cabang[0].nama}` : '—'}
              </div>
            ) : (
              <Select value={cabangId} onChange={(e) => setCabangId(e.target.value)}>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={`Akun Kas/Bank ${tipe === 'TRANSFER' ? '(dari)' : ''}`}>
            <Select value={akunKasBankId} onChange={(e) => setAkunKasBankId(e.target.value)} className="font-mono">
              {kasBank.map((a) => (
                <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
              ))}
            </Select>
          </FormField>
          {tipe === 'TRANSFER' && (
            <FormField label="Akun Tujuan">
              <Select value={akunKasBankLawanId} onChange={(e) => setAkunKasBankLawanId(e.target.value)} className="font-mono">
                {kasBank.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} {a.nama}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Total (Rp)">
            <Input numeric type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} required />
          </FormField>
          <FormField label="Kontak (pihak transaksi)" className="col-span-2">
            <Input type="text" value={kontak} onChange={(e) => setKontak(e.target.value)} placeholder="(opsional)" />
          </FormField>
          <FormField label="Deskripsi">
            <Input type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="(opsional)" />
          </FormField>
          <FormField
            className="col-span-3"
            label={<>Link Bukti Transaksi <span className="text-tanah-500 normal-case">(opsional — URL scan slip/foto struk)</span></>}
          >
            <Input mono type="url" value={linkBukti} onChange={(e) => setLinkBukti(e.target.value)} placeholder="https://drive.google.com/…" />
          </FormField>
        </div>

        {(openSales.length > 0 || openPurchases.length > 0) && (
          <div className="mt-4 pt-4 border-t border-cream-200">
            <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-2">
              Template: pelunasan faktur belum lunas
            </div>
            <div className="flex flex-wrap gap-1.5">
              {openSales.slice(0, 5).map((inv) => (
                <Button key={inv.id} type="button" variant="success" size="sm" onClick={() => applyPelunasanPiutang(inv)}>
                  ← {inv.nomor} {inv.vendorOrCustomer}
                </Button>
              ))}
              {openPurchases.slice(0, 5).map((inv) => (
                <Button key={inv.id} type="button" variant="soft-bata" size="sm" onClick={() => applyPelunasanUtang(inv)}>
                  → {inv.nomor} {inv.vendorOrCustomer}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {tipe !== 'TRANSFER' && (
        <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-cream-200">
            <SectionHeader className="mb-0">2 · Baris Alokasi</SectionHeader>
          </div>
          <div className="overflow-x-auto lentera-scroll">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-3 py-2 font-bold w-8">#</th>
                <th className="px-3 py-2 font-bold">Akun Lawan</th>
                {showProjects && <th className="px-3 py-2 font-bold w-36">Project</th>}
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
                  {showProjects && (
                    <td className="px-3 py-1.5">
                      <select value={l.projectId} onChange={(e) => updLine(i, { projectId: e.target.value })}
                        className="w-full px-2 py-1.5 bg-cream-50 border border-cream-300 rounded text-sm">
                        <option value="">—</option>
                        {projects!.map((p) => (
                          <option key={p.id} value={p.id}>{p.kode}</option>
                        ))}
                      </select>
                    </td>
                  )}
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
                <td colSpan={showProjects ? 4 : 3} className="px-3 py-2">
                  <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Tambah baris</Button>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {sumLines.toLocaleString('id-ID')}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        </section>
      )}

      <StatusBanner
        tone={balanced ? 'success' : 'danger'}
        right={
          <div className="flex items-center gap-2">
            {error && <span className="text-bata-700 text-xs">{error}</span>}
            <Button type="submit" size="sm" disabled={submitting || !balanced}>
              {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
            </Button>
          </div>
        }
      >
        {balanced
          ? '✓ Seimbang — siap diposting'
          : `Selisih: ${(sumLines - totalNum).toLocaleString('id-ID')}`}
      </StatusBanner>
    </form>
  );
}
