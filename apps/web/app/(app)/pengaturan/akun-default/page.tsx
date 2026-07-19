import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { GlConfigRow } from '@/components/GlConfigRow';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Table, THead, TH, TBody, TR, TD,
} from '@/components/ui';
import { BackLink } from '@/components/BackLink';

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
      <PageContainer size="list">
        <BackLink href="/dashboard" label="← Kembali ke Dashboard" />
        <PageHeader
          title="Akun Default (GL Config)"
          subtitle="Pemetaan akun untuk auto-posting jurnal: opname, disposal aset, payroll, dan komponen laporan keuangan. Kalau dibiarkan kosong, system pakai kode default COA Indonesia (kolom kanan)."
        />

        <Table>
          <THead>
            <TH>Kategori</TH>
            <TH>Akun terpilih</TH>
            <TH numeric className="w-28">Default</TH>
          </THead>
          <TBody>
            {config.map((row) => (
              <TR key={row.key}>
                <TD className="py-3">
                  <div className="font-semibold text-tanah-700">{KEY_LABEL[row.key] ?? row.key}</div>
                  <div className="text-xs text-tanah-500 mt-0.5">{KEY_DESC[row.key]}</div>
                </TD>
                <TD className="py-3">
                  <GlConfigRow
                    configKey={row.key}
                    defaultKode={row.defaultKode}
                    serverValue={row.accountId}
                    options={postable}
                    action={updateConfigAction}
                  />
                </TD>
                <TD className="py-3 text-right font-mono text-xs text-tanah-500">
                  {row.defaultKode}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="mt-4 text-xs text-tanah-500">
          <strong>Catatan:</strong> Akun yang dipilih harus <em>postable</em> (leaf, bukan akun induk).
          Pemetaan ini di-resolve setiap kali auto-posting jurnal — perubahan
          berlaku untuk jurnal baru, tidak retroaktif.
        </div>
      </PageContainer>
    </>
  );
}
