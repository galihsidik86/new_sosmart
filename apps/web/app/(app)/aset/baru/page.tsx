import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { AsetForm } from '@/components/AsetForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

interface Cabang { id: string; kode: string; nama: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

async function submitAset(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  await apiFetch('/aset', {
    method: 'POST', tenantId,
    body: JSON.stringify(payload),
  });
}

export default async function AsetBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [cabang, accounts] = await Promise.all([
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
  ]);
  // Akun ASET (kelompok aset tetap: 1-20x), AKUMULASI (kontra-aset, kode mengandung "Akumulasi"),
  // BEBAN PENYUSUTAN (mengandung "Penyusutan").
  const akunAset = accounts.filter((a) =>
    a.isPostable && a.kode.startsWith('1-20') && !a.nama.toLowerCase().includes('akumulasi'),
  );
  const akunAkum = accounts.filter((a) =>
    a.isPostable && a.nama.toLowerCase().includes('akumulasi'),
  );
  const akunBeban = accounts.filter((a) =>
    a.isPostable && (a.kode === '6-103' || a.nama.toLowerCase().includes('penyusutan')),
  );

  return (
    <>
      <Topbar breadcrumb="Aset Tetap / Baru" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-4xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-6">
          Aset Tetap Baru
        </h1>
        <AsetForm
          cabang={cabang}
          akunAset={akunAset} akunAkumulasi={akunAkum} akunBeban={akunBeban}
          submit={submitAset}
        />
      </div>
    </>
  );
}
