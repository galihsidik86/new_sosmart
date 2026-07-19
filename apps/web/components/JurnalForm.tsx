'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Card, Button, FormField, Input, Select, StatusBanner, SectionHeader, Combobox } from './ui';
import { LinkBuktiInput, splitBukti, mergeBukti } from './LinkBuktiInput';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Account {
  id: string;
  kode: string;
  nama: string;
  isPostable: boolean;
  normalBalance: 'DEBIT' | 'KREDIT';
}
interface Cabang { id: string; kode: string; nama: string }
interface Project { id: string; kode: string; nama: string }

interface Line {
  accountId: string;
  projectId: string; // '' = tanpa project
  debit: string;
  kredit: string;
  deskripsi: string;
}

interface DefaultValues {
  tanggal: string;          // 'YYYY-MM-DD'
  cabangId: string;
  deskripsi: string;
  linkBukti?: string;
  linkBuktiTambahan?: string[];
  lines: Line[];
}

interface JurnalFormProps {
  accounts: Account[];
  cabang: Cabang[];
  /** List project AKTIF untuk tenant. Kalau kosong, kolom project disembunyikan. */
  projects?: Project[];
  /** Server action: terima FormData berisi JSON di field 'payload'.
   *  Kembalikan FormState (ok:false + message) saat gagal — server action
   *  menangkap error di sisi server supaya pesan tak ter-redaksi produksi. */
  submit: (formData: FormData) => Promise<FormState | void>;
  /** Kalau diisi, form jalan dalam mode edit (prefilled). */
  defaultValues?: DefaultValues;
  /** Path redirect setelah submit sukses (default '/pembukuan/jurnal'). */
  redirectTo?: string;
  /** Label tombol submit (default 'Simpan draft'). */
  submitLabel?: string;
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

export function JurnalForm({
  accounts, cabang, projects, submit, defaultValues, redirectTo, submitLabel,
}: JurnalFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(defaultValues?.tanggal ?? today);
  const [deskripsi, setDeskripsi] = useState(defaultValues?.deskripsi ?? '');
  const [buktiList, setBuktiList] = useState<string[]>(
    mergeBukti(defaultValues?.linkBukti, defaultValues?.linkBuktiTambahan),
  );
  const [cabangId, setCabangId] = useState(defaultValues?.cabangId ?? cabang[0]?.id ?? '');
  // Project di header = default untuk semua baris. Jurnal (mis. alokasi lintas
  // project) tetap boleh override per baris di kolom Project.
  const [projectId, setProjectId] = useState(defaultValues?.lines?.[0]?.projectId ?? '');
  const [lines, setLines] = useState<Line[]>(
    defaultValues?.lines ?? [
      { accountId: '', projectId: '', debit: '0', kredit: '0', deskripsi: '' },
      { accountId: '', projectId: '', debit: '0', kredit: '0', deskripsi: '' },
    ],
  );
  const showProjects = !!projects && projects.length > 0;
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invalidLines, setInvalidLines] = useState<Set<number>>(new Set());
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
  const accountOptions = useMemo(
    () => postable.map((a) => ({ value: a.id, label: `${a.kode}  ${a.nama}` })),
    [postable],
  );
  const projectOptions = useMemo(
    () => [{ value: '', label: '— tanpa project —' }, ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.kode} — ${p.nama}` }))],
    [projects],
  );

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((p) => [...p, { accountId: '', projectId, debit: '0', kredit: '0', deskripsi: '' }]);

  // Set project header → terapkan ke semua baris (bulk). Per-baris tetap bisa
  // diubah setelahnya.
  const setHeaderProject = (v: string) => {
    setProjectId(v);
    setLines((prev) => prev.map((l) => ({ ...l, projectId: v })));
  };

  const removeLine = (i: number) =>
    setLines((p) => (p.length <= 2 ? p : p.filter((_, k) => k !== i)));

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setDeskripsi(tpl.desc);
    setLines(
      tpl.lines.map((l) => {
        const acc = postable.find((a) => a.kode === l.kode);
        return {
          accountId: acc?.id ?? '',
          projectId,
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
    setInvalidLines(new Set());
    // Baris yang punya nominal tapi belum pilih akun.
    const missing = new Set<number>();
    lines.forEach((l, i) => {
      const hasNilai = Number(l.debit || 0) > 0 || Number(l.kredit || 0) > 0;
      if (!l.accountId && hasNilai) missing.add(i);
    });
    if (missing.size > 0) {
      setInvalidLines(missing);
      setError(`Pilih akun untuk baris ${[...missing].map((i) => i + 1).join(', ')}.`);
      return;
    }
    if (!totals.balanced) {
      setError('Total debit dan kredit harus seimbang dan > 0');
      return;
    }
    if (!cabangId) {
      setError('Pilih cabang');
      return;
    }
    const { linkBukti, linkBuktiTambahan } = splitBukti(buktiList);
    const payload = {
      cabangId,
      tanggal,
      deskripsi,
      linkBukti,
      linkBuktiTambahan,
      sumber: 'MANUAL' as const,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        projectId: l.projectId || null,
        debit: String(Number(l.debit || 0)),
        kredit: String(Number(l.kredit || 0)),
        deskripsi: l.deskripsi || undefined,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        const res = await submit(fd);
        if (res && !res.ok) {
          setError(res.message ?? 'Gagal menyimpan jurnal');
          return;
        }
        router.push((redirectTo ?? '/pembukuan/jurnal') as Route);
      } catch (e) {
        setError(apiErrorToState(e).message ?? 'Gagal menyimpan jurnal');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <SectionHeader className="mb-4">1 · Informasi Jurnal</SectionHeader>
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
          {showProjects && (
            <FormField label={<>Project <span className="text-tanah-500 normal-case">(default semua baris)</span></>}>
              <Combobox value={projectId} onChange={setHeaderProject} options={projectOptions} placeholder="— tanpa project —" />
            </FormField>
          )}
          <FormField label="Deskripsi" className="col-start-1 col-span-full">
            <Input type="text" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="Penjualan tunai barang dagang" required />
          </FormField>
          <FormField
            className="col-span-full"
            label={<>Link Bukti Transaksi <span className="text-tanah-500 normal-case">(opsional — bisa lebih dari satu: URL scan/foto/Drive/Dropbox)</span></>}
          >
            <LinkBuktiInput value={buktiList} onChange={setBuktiList} />
          </FormField>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="text-xs text-tanah-500 self-center">Template cepat:</span>
          {TEMPLATES.map((t) => (
            <Button key={t.label} type="button" variant="secondary" size="sm" onClick={() => applyTemplate(t)}>
              {t.label}
            </Button>
          ))}
        </div>
      </Card>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between">
          <SectionHeader className="mb-0">2 · Baris Jurnal</SectionHeader>
          <span className="text-xs text-tanah-500">debit = kredit</span>
        </div>
        <div className="overflow-x-auto lentera-scroll">
        <table className="w-full text-sm">
          <thead className="bg-cream-50 text-left">
            <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
              <th className="px-3 py-2.5 font-bold w-8">#</th>
              <th className="px-3 py-2.5 font-bold">Akun</th>
              {showProjects && <th className="hidden sm:table-cell px-3 py-2.5 font-bold w-36">Project</th>}
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
                  <Combobox
                    value={l.accountId}
                    onChange={(v) => {
                      updateLine(i, { accountId: v });
                      if (v) {
                        setInvalidLines((prev) => {
                          const n = new Set(prev);
                          n.delete(i);
                          return n;
                        });
                      }
                    }}
                    options={accountOptions}
                    mono
                    invalid={invalidLines.has(i)}
                    placeholder="— pilih akun —"
                  />
                </td>
                {showProjects && (
                  <td className="hidden sm:table-cell px-3 py-1.5">
                    <Combobox
                      value={l.projectId}
                      onChange={(v) => updateLine(i, { projectId: v })}
                      options={projectOptions}
                      placeholder="— tanpa project —"
                    />
                  </td>
                )}
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
              <td colSpan={showProjects ? 4 : 3} className="px-3 py-2.5">
                <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Tambah baris</Button>
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
        </div>
      </section>

      <StatusBanner
        tone={totals.balanced ? 'success' : totals.td > 0 || totals.tk > 0 ? 'danger' : 'neutral'}
        right={
          <div className="flex items-center gap-2">
            {error && <span className="text-bata-700 text-xs">{error}</span>}
            <Button type="submit" size="sm" disabled={submitting || !totals.balanced}>
              {submitting ? 'Menyimpan…' : (submitLabel ?? 'Simpan sebagai DRAFT')}
            </Button>
          </div>
        }
      >
        {totals.balanced
          ? '✓ Seimbang — siap diposting'
          : totals.td === totals.tk
          ? 'Isi nominal debit & kredit dulu'
          : `Belum seimbang — selisih Rp ${Math.abs(totals.diff).toLocaleString('id-ID')}`}
      </StatusBanner>
    </form>
  );
}
