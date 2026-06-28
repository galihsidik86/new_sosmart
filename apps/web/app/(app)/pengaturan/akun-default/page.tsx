import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

interface ConfigRow {
  key: string;
  defaultKode: string;
  accountId: string | null;
  account: { id: string; kode: string; nama: string } | null;
}

interface AccountOpt {
  id: string;
  kode: string;
  nama: string;
  isPostable: boolean;
}

const KEY_LABEL: Record<string, string> = {
  OPNAME_MINUS: 'Beban Penyesuaian Stok (opname kurang)',
  OPNAME_PLUS: 'Pendapatan Penyesuaian Stok (opname lebih)',
  DISPOSAL_LABA: 'Laba Penjualan Aset Tetap',
  DISPOSAL_RUGI: 'Rugi Penjualan / Penghapusan Aset Tetap',
  BEBAN_GAJI: 'Beban Gaji & Tunjangan',
  UTANG_PPH21: 'Utang PPh 21 Karyawan',
  UTANG_BPJS: 'Utang BPJS Karyawan',
  MODAL_DISETOR: 'Modal Disetor',
  LABA_DITAHAN: 'Saldo Laba (Laba Ditahan)',
  DIVIDEN: 'Dividen / Prive',
  BEBAN_PENYUSUTAN: 'Beban Penyusutan (untuk Arus Kas)',
};

const KEY_DESC: Record<string, string> = {
  OPNAME_MINUS: 'Auto-posting saat post Opname dengan selisih NEGATIF (delta-).',
  OPNAME_PLUS: 'Auto-posting saat post Opname dengan selisih POSITIF (delta+).',
  DISPOSAL_LABA: 'Selisih kalau hargaJual > nilaiBuku saat dispose aset.',
  DISPOSAL_RUGI: 'Selisih saat dispose aset (jual rugi / rusak / pensiun).',
  BEBAN_GAJI: 'Side debit jurnal payroll.',
  UTANG_PPH21: 'Side kredit jurnal payroll — PPh 21 dipotong.',
  UTANG_BPJS: 'Side kredit jurnal payroll — BPJS karyawan dipotong.',
  MODAL_DISETOR: 'Dipakai Arus Kas (pendanaan) & Perubahan Ekuitas.',
  LABA_DITAHAN: 'Dipakai Perubahan Ekuitas — saldo awal laba ditahan.',
  DIVIDEN: 'Dipakai Arus Kas (pendanaan keluar) & Perubahan Ekuitas.',
  BEBAN_PENYUSUTAN: 'Dipakai Arus Kas untuk add-back non-kas.',
};

async function updateConfigAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const key = String(formData.get('key'));
  const accountId = (formData.get('accountId') as string) || null;
  await apiFetch(`/gl-config/${key}`, {
    method: 'PUT',
    tenantId,
    body: JSON.stringify({ accountId }),
  });
  revalidatePath('/pengaturan/akun-default');
}

export default async function AkunDefaultPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [config, accounts] = await Promise.all([
    apiFetch<ConfigRow[]>('/gl-config', { tenantId }),
    apiFetch<AccountOpt[]>('/accounts?view=flat', { tenantId }),
  ]);
  const postable = accounts.filter((a) => a.isPostable);

  return (
    <>
      <Topbar breadcrumb="Pengaturan › Akun Default" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Akun Default (GL Config)
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Pemetaan akun untuk auto-posting jurnal: opname, disposal aset,
            payroll, dan komponen laporan keuangan.
            Kalau dibiarkan kosong, system pakai kode default COA Indonesia (kolom kanan).
          </p>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500 border-b border-cream-200">
                <th className="px-4 py-3 font-bold">Kategori</th>
                <th className="px-4 py-3 font-bold">Akun terpilih</th>
                <th className="px-4 py-3 font-bold text-right w-28">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {config.map((row) => (
                <tr key={row.key} className="hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-tanah-700">{KEY_LABEL[row.key] ?? row.key}</div>
                    <div className="text-xs text-tanah-500 mt-0.5">{KEY_DESC[row.key]}</div>
                  </td>
                  <td className="px-4 py-3">
                    <form
                      action={updateConfigAction}
                      className="flex items-center gap-2"
                      // key berubah saat accountId berubah → React remount form +
                      // select dengan defaultValue baru (uncontrolled defaultValue
                      // tidak ke-update tanpa remount).
                      key={`${row.key}:${row.accountId ?? 'none'}`}
                    >
                      <input type="hidden" name="key" value={row.key} />
                      <select
                        name="accountId"
                        defaultValue={row.accountId ?? ''}
                        className="flex-1 px-2.5 py-1.5 bg-cream-50 border border-cream-300 rounded-md text-sm"
                      >
                        <option value="">— pakai default ({row.defaultKode}) —</option>
                        {postable.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.kode} — {a.nama}
                          </option>
                        ))}
                      </select>
                      <button className="px-3 py-1.5 bg-sogan-500 hover:bg-sogan-600 text-cream-50 rounded-md text-xs font-semibold">
                        Simpan
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-tanah-500">
                    {row.defaultKode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-tanah-500">
          <strong>Catatan:</strong> Akun yang dipilih harus <em>postable</em> (leaf, bukan akun induk).
          Pemetaan ini di-resolve setiap kali auto-posting jurnal — perubahan
          berlaku untuk jurnal baru, tidak retroaktif.
        </div>
      </div>
    </>
  );
}
