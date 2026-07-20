'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FieldError } from './FieldError';
import { Combobox, MoneyInput } from './ui';
import type { FormState } from '@/lib/form-state';

type Kelompok =
  | 'BANGUNAN_PERMANEN' | 'BANGUNAN_NON_PERMANEN'
  | 'KELOMPOK_I' | 'KELOMPOK_II' | 'KELOMPOK_III' | 'KELOMPOK_IV';
type Metode = 'GARIS_LURUS' | 'SALDO_MENURUN';

const MASA: Record<Kelompok, number> = {
  BANGUNAN_PERMANEN: 240,
  BANGUNAN_NON_PERMANEN: 120,
  KELOMPOK_I: 48,
  KELOMPOK_II: 96,
  KELOMPOK_III: 192,
  KELOMPOK_IV: 240,
};

const KELOMPOK_LABEL: Record<Kelompok, string> = {
  BANGUNAN_PERMANEN: 'Bangunan Permanen (20 thn) — wajib garis lurus',
  BANGUNAN_NON_PERMANEN: 'Bangunan Non-Permanen (10 thn) — wajib garis lurus',
  KELOMPOK_I: 'Kelompok I — 4 thn (peralatan, komputer)',
  KELOMPOK_II: 'Kelompok II — 8 thn (kendaraan, mesin)',
  KELOMPOK_III: 'Kelompok III — 16 thn',
  KELOMPOK_IV: 'Kelompok IV — 20 thn',
};

interface Cabang { id: string; kode: string; nama: string }
interface Account { id: string; kode: string; nama: string }

interface AsetFormProps {
  cabang: Cabang[];
  akunAset: Account[];
  akunAkumulasi: Account[];
  akunBeban: Account[];
  submit: (formData: FormData) => Promise<FormState | void>;
}

const inputCls = (invalid: boolean) =>
  `w-full px-2.5 py-2 bg-cream-50 border rounded-md text-sm ${invalid ? 'border-bata-500' : 'border-cream-300'}`;

export function AsetForm({ cabang, akunAset, akunAkumulasi, akunBeban, submit }: AsetFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [cabangId, setCabangId] = useState(cabang[0]?.id ?? '');
  const [kelompok, setKelompok] = useState<Kelompok>('KELOMPOK_I');
  const [metode, setMetode] = useState<Metode>('GARIS_LURUS');
  const [tanggalPerolehan, setTanggalPerolehan] = useState(today);
  const [hargaPerolehan, setHargaPerolehan] = useState('0');
  const [nilaiResidu, setNilaiResidu] = useState('0');
  const [masaBulan, setMasaBulan] = useState<number>(MASA.KELOMPOK_I);
  const [akumulasiAwal, setAkumulasiAwal] = useState('0');
  const [lastPeriode, setLastPeriode] = useState('');
  const [akunAsetId, setAkunAsetId] = useState(akunAset[0]?.id ?? '');
  const [akunAkumId, setAkunAkumId] = useState(akunAkumulasi[0]?.id ?? '');
  const [akunBebanId, setAkunBebanId] = useState(akunBeban[0]?.id ?? '');
  const [catatan, setCatatan] = useState('');
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const router = useRouter();

  const isBangunan =
    kelompok === 'BANGUNAN_PERMANEN' || kelompok === 'BANGUNAN_NON_PERMANEN';

  // Auto-suggest masa & paksa GL untuk bangunan
  const onKelompokChange = (k: Kelompok) => {
    setKelompok(k);
    setMasaBulan(MASA[k]);
    if (k === 'BANGUNAN_PERMANEN' || k === 'BANGUNAN_NON_PERMANEN') {
      setMetode('GARIS_LURUS');
    }
  };

  const penyusutanPerBulan = useMemo(() => {
    const hp = Number(hargaPerolehan || 0);
    const res = Number(nilaiResidu || 0);
    if (metode === 'GARIS_LURUS') {
      return masaBulan > 0 ? (hp - res) / masaBulan : 0;
    }
    // saldo menurun: tarif × nilai buku awal (untuk preview)
    const buku = hp - Number(akumulasiAwal || 0);
    return masaBulan > 0 ? buku * (2 / masaBulan) : 0;
  }, [hargaPerolehan, nilaiResidu, masaBulan, metode, akumulasiAwal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFe({});
    if (isBangunan && metode !== 'GARIS_LURUS') {
      setError('Bangunan wajib metode Garis Lurus (UU PPh).');
      return;
    }
    const payload = {
      cabangId,
      kode, nama,
      kelompok, metode,
      tanggalPerolehan,
      hargaPerolehan, nilaiResidu,
      masaManfaatBulan: masaBulan,
      akumulasiPenyusutan: akumulasiAwal,
      lastDepresiasiPeriode: lastPeriode || undefined,
      akunAsetId, akunAkumulasiId: akunAkumId, akunBebanId,
      catatan: catatan || undefined,
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        const res = await submit(fd);
        if (res && !res.ok) {
          setError(res.fieldErrors ? null : (res.message ?? 'Data tidak valid'));
          setFe(res.fieldErrors ?? {});
          return;
        }
        router.push('/aset/daftar');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Identitas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Kode <span className="text-bata-500">*</span></label>
            <input value={kode} onChange={(e) => setKode(e.target.value)} required placeholder="AT-006"
              className={`${inputCls(!!fe.kode)} font-mono`} />
            <FieldError msg={fe.kode} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Cabang <span className="text-bata-500">*</span></label>
            {cabang.length <= 1 ? (
              <div className="w-full px-2.5 py-2 bg-cream-100 border border-cream-300 rounded-md text-sm text-tanah-700">
                {cabang[0] ? `${cabang[0].kode} — ${cabang[0].nama}` : '—'}
              </div>
            ) : (
              <Combobox value={cabangId} onChange={setCabangId} placeholder="— pilih cabang —"
                options={cabang.map((c) => ({ value: c.id, label: `${c.kode} — ${c.nama}` }))} />
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Nama Aset <span className="text-bata-500">*</span></label>
            <input value={nama} onChange={(e) => setNama(e.target.value)} required placeholder="Komputer laptop produksi 5 unit"
              className={inputCls(!!fe.nama)} />
            <FieldError msg={fe.nama} />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Klasifikasi UU PPh</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Kelompok</label>
            <select value={kelompok} onChange={(e) => onKelompokChange(e.target.value as Kelompok)}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm">
              {(Object.keys(KELOMPOK_LABEL) as Kelompok[]).map((k) => (
                <option key={k} value={k}>{KELOMPOK_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Metode Penyusutan</label>
            <select value={metode} onChange={(e) => setMetode(e.target.value as Metode)}
              disabled={isBangunan}
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm disabled:opacity-60">
              <option value="GARIS_LURUS">Garis Lurus</option>
              <option value="SALDO_MENURUN">Saldo Menurun</option>
            </select>
            {isBangunan && <p className="text-[10px] text-tanah-500 mt-1">Bangunan wajib garis lurus.</p>}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Masa Manfaat (bulan)</label>
            <input type="number" min={1} value={masaBulan}
              onChange={(e) => setMasaBulan(Number(e.target.value))}
              className={`${inputCls(!!fe.masaManfaatBulan)} font-mono tabular-nums`} />
            <FieldError msg={fe.masaManfaatBulan} />
            <p className="text-[10px] text-tanah-500 mt-1">Default: {MASA[kelompok]} bulan ({MASA[kelompok] / 12} tahun)</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Tanggal Perolehan</label>
            <input type="date" value={tanggalPerolehan} onChange={(e) => setTanggalPerolehan(e.target.value)} required
              className={inputCls(!!fe.tanggalPerolehan)} />
            <FieldError msg={fe.tanggalPerolehan} />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Nilai</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Harga Perolehan <span className="text-bata-500">*</span></label>
            <MoneyInput value={hargaPerolehan} onValueChange={setHargaPerolehan} required invalid={!!fe.hargaPerolehan} />
            <FieldError msg={fe.hargaPerolehan} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Nilai Residu</label>
            <MoneyInput value={nilaiResidu} onValueChange={setNilaiResidu} invalid={!!fe.nilaiResidu} />
            <FieldError msg={fe.nilaiResidu} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akumulasi Penyusutan Awal</label>
            <MoneyInput value={akumulasiAwal} onValueChange={setAkumulasiAwal} />
            <p className="text-[10px] text-tanah-500 mt-1">Untuk aset existing — opening balance saat onboarding.</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Last Depresiasi (YYYY-MM)</label>
            <input type="text" value={lastPeriode} pattern="\d{4}-\d{2}"
              onChange={(e) => setLastPeriode(e.target.value)} placeholder="2026-04"
              className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm font-mono" />
            <p className="text-[10px] text-tanah-500 mt-1">Periode terakhir yang sudah dihitung (kosongkan untuk aset baru).</p>
          </div>
        </div>
        <div className="mt-3 px-3 py-2 bg-cream-50 rounded-md text-xs text-tanah-700 flex justify-between">
          <span>Estimasi penyusutan bulan ini:</span>
          <span className="font-mono tabular-nums font-semibold">Rp {Math.round(penyusutanPerBulan).toLocaleString('id-ID')}</span>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h2 className="text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3">Akun Jurnal</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Aset</label>
            <select value={akunAsetId} onChange={(e) => setAkunAsetId(e.target.value)} required
              className={`${inputCls(!!fe.akunAsetId)} font-mono`}>
              {akunAset.map((a) => <option key={a.id} value={a.id}>{a.kode}  {a.nama}</option>)}
            </select>
            <FieldError msg={fe.akunAsetId} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Akumulasi (kontra-aset)</label>
            <select value={akunAkumId} onChange={(e) => setAkunAkumId(e.target.value)} required
              className={`${inputCls(!!fe.akunAkumulasiId)} font-mono`}>
              {akunAkumulasi.map((a) => <option key={a.id} value={a.id}>{a.kode}  {a.nama}</option>)}
            </select>
            <FieldError msg={fe.akunAkumulasiId} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">Akun Beban Penyusutan</label>
            <select value={akunBebanId} onChange={(e) => setAkunBebanId(e.target.value)} required
              className={`${inputCls(!!fe.akunBebanId)} font-mono`}>
              {akunBeban.map((a) => <option key={a.id} value={a.id}>{a.kode}  {a.nama}</option>)}
            </select>
            <FieldError msg={fe.akunBebanId} />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-bata-700 text-sm">{error}</span>}
        <button type="submit" disabled={submitting}
          className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 disabled:bg-cream-400 text-cream-50 rounded-lg text-sm font-semibold">
          {submitting ? 'Menyimpan…' : 'Simpan Aset'}
        </button>
      </div>
    </form>
  );
}
