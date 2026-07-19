'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Card, Button, FormField, Input, Select, SectionHeader, Combobox } from './ui';
import { LinkBuktiInput, splitBukti, mergeBukti } from './LinkBuktiInput';
import { apiErrorToState, type FormState } from '@/lib/form-state';

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
  /// Tarif PPh 23 preset (kalau item ini jasa dan sudah di-set).
  pph23Tarif?: { kode: string; nama: string; tarif: string } | null;
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
  /** Attach ke project — '' = tanpa project. */
  projectId: string;
}

interface Project { id: string; kode: string; nama: string }
interface TermOption { id: string; nama: string; hari: number }

export interface InvoiceDefaultValues {
  tanggal: string;
  partyId: string;
  cabangId: string;
  termin: 'TUNAI' | 'KREDIT';
  tarifPpn: 11 | 12;
  tarifPph23?: 0 | 2 | 15;
  potongPph23?: boolean;
  /** Kalau true, hargaSatuan input sudah include PPN (mode POS/harga tag). */
  hargaTermasukPajak?: boolean;
  /** Untuk TUNAI: id akun kas/bank. */
  kasBankId?: string;
  deskripsi: string;
  linkBukti?: string;
  linkBuktiTambahan?: string[];
  termPembayaranId?: string | null;
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
  /** List project AKTIF. Kalau kosong / undefined, kolom project disembunyikan. */
  projects?: Project[];
  /** Master termin pembayaran (kredit). Kalau kosong, dropdown tidak muncul. */
  termPembayaran?: TermOption[];
  /** Server action: kembalikan FormState (ok:false + message) saat gagal.
   *  Ditangkap di server supaya pesan tak ter-redaksi produksi. */
  submit: (formData: FormData) => Promise<FormState | void>;
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
  mode, items, parties, cabang, accounts, kasBankAccounts, projects, termPembayaran, submit,
  defaultValues, redirectTo, submitLabel,
}: InvoiceFormProps) {
  const showProjects = !!projects && projects.length > 0;
  const terms = termPembayaran ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [partyId, setPartyId] = useState(defaultValues?.partyId ?? parties[0]?.id ?? '');
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  const [termin, setTermin] = useState<'TUNAI' | 'KREDIT'>(defaultValues?.termin ?? 'KREDIT');
  const [tarifPpn, setTarifPpn] = useState<11 | 12>(defaultValues?.tarifPpn ?? 11);
  const [tarifPph23, setTarifPph23] = useState<0 | 2 | 15>(defaultValues?.tarifPph23 ?? 2);
  const [potongPph23, setPotongPph23] = useState(defaultValues?.potongPph23 ?? true);
  const [hargaTermasukPajak, setHargaTermasukPajak] = useState(defaultValues?.hargaTermasukPajak ?? false);
  const [kasBankId, setKasBankId] = useState(defaultValues?.kasBankId ?? kasBankAccounts[0]?.id ?? '');
  const [deskripsi, setDeskripsi] = useState(defaultValues?.deskripsi ?? '');
  const [buktiList, setBuktiList] = useState<string[]>(
    mergeBukti(defaultValues?.linkBukti, defaultValues?.linkBuktiTambahan),
  );
  const [termId, setTermId] = useState(defaultValues?.termPembayaranId ?? '');
  // Project di level header — berlaku untuk seluruh baris faktur (1 faktur = 1
  // project). Saat edit, ambil dari baris pertama (semua baris seharusnya sama).
  const [projectId, setProjectId] = useState(defaultValues?.lines?.[0]?.projectId ?? '');
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Generate SEKALI per form mount (bukan per submit) — kalau user klik
  // submit dobel atau request retry karena jaringan lambat, backend
  // (createDraft) mengenali key yang sama dan tidak bikin faktur dobel
  // (R3, EVALUASI.md).
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [lines, setLines] = useState<Line[]>(
    defaultValues?.lines ?? [
      { itemId: null, deskripsi: '', qty: '1', hargaSatuan: '0', satuan: 'Pcs',
        diskonPersen: '0', klasifikasiPpn: 'BKP', isJasa: false, accountId: '', projectId: '' },
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
    // Purchase: kalau item ini jasa dengan preset PPh 23, auto-fill header tarif.
    if (mode === 'purchase' && it.isJasa && it.pph23Tarif) {
      const preset = Number(it.pph23Tarif.tarif);
      if (preset === 0 || preset === 2 || preset === 15) {
        setTarifPph23(preset as 0 | 2 | 15);
        setPotongPph23(true);
      }
    }
  };

  const addLine = () =>
    setLines((p) => [
      ...p,
      { itemId: null, deskripsi: '', qty: '1', hargaSatuan: '0', satuan: 'Pcs',
        diskonPersen: '0', klasifikasiPpn: 'BKP', isJasa: false, accountId: '', projectId: '' },
    ]);

  const removeLine = (i: number) =>
    setLines((p) => (p.length <= 1 ? p : p.filter((_, k) => k !== i)));

  const partyOptions = useMemo(
    () => parties.map((p) => ({ value: p.id, label: `${p.kode} — ${p.nama}${p.isPkp ? ' (PKP)' : ''}` })),
    [parties],
  );
  const itemOptions = useMemo(
    () => [{ value: '', label: '— manual —' }, ...items.map((it) => ({ value: it.id, label: `${it.kode}  ${it.nama}` }))],
    [items],
  );
  const accountOptions = useMemo(
    () => accounts.filter((a) => a.isPostable).map((a) => ({ value: a.id, label: `${a.kode}  ${a.nama}` })),
    [accounts],
  );
  const projectOptions = useMemo(
    () => [{ value: '', label: '— tanpa project —' }, ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.kode} — ${p.nama}` }))],
    [projects],
  );

  // Compute totals. Mirror backend `computeTotals` — kalau `hargaTermasukPajak`,
  // gross ← qty × harga; DPP di-reverse-calc dari gross (gross / (1 + tarifEff)).
  const tarifEff = tarifPpn === 11 ? 0.11 : tarifPpn / 100;
  const totals = useMemo(() => {
    let totDpp = 0, totPpn = 0, totPph23 = 0;
    const partyPkp = mode === 'purchase' ? party?.isPkp ?? false : true;
    for (const l of lines) {
      const qty = Number(l.qty || 0);
      const harga = Number(l.hargaSatuan || 0);
      const gross = qty * harga;
      const diskon = gross * (Number(l.diskonPersen || 0) / 100);
      const grossAfterDisc = gross - diskon;
      const kena = PPNABLE.includes(l.klasifikasiPpn) && (mode === 'sales' || partyPkp);
      let dpp: number;
      let ppn: number;
      if (hargaTermasukPajak && kena) {
        dpp = grossAfterDisc / (1 + tarifEff);
        ppn = grossAfterDisc - dpp;
      } else {
        dpp = grossAfterDisc;
        ppn = kena ? dpp * tarifEff : 0;
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
  }, [lines, tarifEff, tarifPph23, potongPph23, party, mode, hargaTermasukPajak]);

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

    const { linkBukti, linkBuktiTambahan } = splitBukti(buktiList);
    // Termin master hanya relevan untuk KREDIT (jatuh tempo). TUNAI → abaikan.
    const termPembayaranId = termin === 'KREDIT' ? (termId || null) : null;
    const payload = mode === 'sales' ? {
      cabangId,
      customerId: partyId,
      tanggal,
      termin,
      termPembayaranId,
      akunArId: akunArOrAp,
      deskripsi: deskripsi || undefined,
      linkBukti,
      linkBuktiTambahan,
      tarifPpnPersen: tarifPpn,
      hargaTermasukPajak,
      idempotencyKey,
      lines: lines.map((l) => ({
        itemId: l.itemId, deskripsi: l.deskripsi, qty: l.qty, satuan: l.satuan,
        hargaSatuan: l.hargaSatuan, diskonPersen: l.diskonPersen,
        klasifikasiPpn: l.klasifikasiPpn, isJasa: l.isJasa,
        akunPendapatanId: l.accountId,
        projectId: projectId || null,
      })),
    } : {
      cabangId,
      vendorId: partyId,
      tanggal,
      termin,
      termPembayaranId,
      akunApId: akunArOrAp,
      deskripsi: deskripsi || undefined,
      linkBukti,
      linkBuktiTambahan,
      tarifPpnPersen: tarifPpn,
      tarifPph23Persen: tarifPph23,
      potongPph23,
      hargaTermasukPajak,
      idempotencyKey,
      lines: lines.map((l) => ({
        itemId: l.itemId, deskripsi: l.deskripsi, qty: l.qty, satuan: l.satuan,
        hargaSatuan: l.hargaSatuan, diskonPersen: l.diskonPersen,
        klasifikasiPpn: l.klasifikasiPpn, isJasa: l.isJasa,
        akunDebitId: l.accountId,
        projectId: projectId || null,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        const res = await submit(fd);
        if (res && !res.ok) {
          setError(res.message ?? 'Gagal menyimpan');
          return;
        }
        router.push((redirectTo ?? (mode === 'sales' ? '/transaksi/penjualan' : '/transaksi/pembelian')) as Route);
      } catch (e) {
        setError(apiErrorToState(e).message ?? 'Gagal menyimpan');
      }
    });
  };

  const partyLabel = mode === 'sales' ? 'Pelanggan' : 'Vendor';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <SectionHeader className="mb-4">1 · Informasi {mode === 'sales' ? 'Faktur' : 'Tagihan'}</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Tanggal">
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required />
          </FormField>
          <FormField label="Cabang">
            {cabang.length <= 1 ? (
              <div className="w-full px-3 py-2 bg-cream-100 border border-cream-300 rounded-lg text-sm text-tanah-700">
                {cabang[0] ? `${cabang[0].kode} — ${cabang[0].nama}` : '—'}
              </div>
            ) : (
              <Select value={cabangId} onChange={(e) => setCabangId(e.target.value)} required>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={partyLabel}>
            <Combobox value={partyId} onChange={setPartyId} options={partyOptions} placeholder={`— pilih ${partyLabel.toLowerCase()} —`} />
          </FormField>
          {showProjects && (
            <FormField label="Project">
              <Combobox value={projectId} onChange={setProjectId} options={projectOptions} placeholder="— tanpa project —" />
            </FormField>
          )}
          <FormField label="Termin">
            <Select value={termin} onChange={(e) => setTermin(e.target.value as 'TUNAI' | 'KREDIT')}>
              <option value="KREDIT">KREDIT (termin {party?.terminHari ?? 0} hari)</option>
              <option value="TUNAI">TUNAI</option>
            </Select>
          </FormField>
          {termin === 'KREDIT' && terms.length > 0 && (
            <FormField label="Termin Pembayaran">
              <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
                <option value="">— default pelanggan ({party?.terminHari ?? 0} hari) —</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.nama} — {t.hari} hari</option>
                ))}
              </Select>
            </FormField>
          )}
          {termin === 'TUNAI' && (
            <FormField label="Akun Kas/Bank">
              <Select value={kasBankId} onChange={(e) => setKasBankId(e.target.value)} className="font-mono">
                {kasBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.kode} — {a.nama}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Tarif PPN">
            <Select value={tarifPpn} onChange={(e) => setTarifPpn(Number(e.target.value) as 11 | 12)}>
              <option value={11}>11% (PMK 131/2024 — DPP nilai lain)</option>
              <option value={12}>12% (BKP mewah, DPP penuh)</option>
            </Select>
          </FormField>
          <label className="flex items-end gap-2 text-sm text-tanah-700 pb-2">
            <input type="checkbox" checked={hargaTermasukPajak}
              onChange={(e) => setHargaTermasukPajak(e.target.checked)} />
            <span>
              Harga termasuk PPN
              <span className="block text-[10px] text-tanah-500 normal-case">
                (harga tag/POS — DPP di-reverse-calc dari gross)
              </span>
            </span>
          </label>
          {mode === 'purchase' && (
            <>
              <FormField label="PPh 23">
                <Select value={tarifPph23} onChange={(e) => setTarifPph23(Number(e.target.value) as 0 | 2 | 15)}>
                  <option value={0}>0% (tidak potong)</option>
                  <option value={2}>2% (jasa)</option>
                  <option value={15}>15% (royalti/dividen/bunga)</option>
                </Select>
              </FormField>
              <label className="flex items-end gap-2 text-sm text-tanah-700 pb-2">
                <input type="checkbox" checked={potongPph23} onChange={(e) => setPotongPph23(e.target.checked)} />
                Potong PPh 23
              </label>
            </>
          )}
          <FormField label="Deskripsi" className="col-span-full">
            <Input type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="(opsional)" />
          </FormField>
          <FormField
            className="col-span-full"
            label={<>Link Bukti Transaksi <span className="text-tanah-500 normal-case">(opsional — bisa lebih dari satu: URL scan/foto/Drive/Dropbox)</span></>}
          >
            <LinkBuktiInput value={buktiList} onChange={setBuktiList} />
          </FormField>
        </div>
      </Card>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between">
          <SectionHeader className="mb-0">2 · Baris Item</SectionHeader>
          <span className="text-xs text-tanah-500">{lines.length} baris</span>
        </div>
        <div className="overflow-x-auto lentera-scroll">
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
              const partyPkp = mode === 'purchase' ? party?.isPkp ?? false : true;
              const kena = PPNABLE.includes(l.klasifikasiPpn) && (mode === 'sales' || partyPkp);
              const grossAfterDisc = qty * harga * (1 - Number(l.diskonPersen || 0) / 100);
              const dpp = hargaTermasukPajak && kena
                ? grossAfterDisc / (1 + tarifEff)
                : grossAfterDisc;
              return (
                <tr key={i}>
                  <td className="px-2 py-1 text-tanah-500 text-xs">{i + 1}</td>
                  <td className="px-2 py-1">
                    <Combobox value={l.itemId ?? ''} onChange={(v) => setItem(i, v)} options={itemOptions} mono size="sm" placeholder="— manual —" className="min-w-[160px]" />
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
                    <Combobox value={l.accountId} onChange={(v) => updLine(i, { accountId: v })} options={accountOptions} mono size="sm" placeholder="— pilih —" className="min-w-[160px]" />
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
        </div>
        <div className="bg-cream-50 px-3 py-2 border-t border-cream-200">
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Tambah baris</Button>
        </div>
      </section>

      <Card>
        <SectionHeader className="mb-4">3 · Ringkasan &amp; Simpan</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">Total DPP</dt>
              <dd className="font-mono tabular-nums text-tanah-700">{totals.totDpp.toLocaleString('id-ID')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tanah-500">PPN ({tarifPpn}%){hargaTermasukPajak ? ' — incl.' : ''}</dt>
              <dd className="font-mono tabular-nums text-tanah-700">{totals.totPpn.toLocaleString('id-ID')}</dd>
            </div>
            {mode === 'purchase' && (
              <div className="flex justify-between gap-4">
                <dt className="text-tanah-500">PPh 23 dipotong</dt>
                <dd className="font-mono tabular-nums text-bata-700">({totals.totPph23.toLocaleString('id-ID')})</dd>
              </div>
            )}
          </dl>

          <div>
            <div className="rounded-xl bg-sogan-50 border border-sogan-100 px-4 py-3 mb-3">
              <div className="text-[11px] uppercase tracking-wider text-sogan-500 font-bold">
                {mode === 'sales' ? 'Total Faktur' : 'Yang dibayar ke vendor'}
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-sogan-700 mt-0.5 whitespace-nowrap">
                Rp {totals.totNetto.toLocaleString('id-ID')}
              </div>
            </div>
            {error && <div className="text-bata-700 text-xs mb-2">{error}</div>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
