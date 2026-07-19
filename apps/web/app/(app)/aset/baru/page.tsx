import { redirect } from 'next/navigation';
import { AsetForm } from '@/components/AsetForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { BackLink } from '@/components/BackLink';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Cabang { id: string; kode: string; nama: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

async function submitAset(formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  try {
    await apiFetch('/aset', {
      method: 'POST', tenantId,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return apiErrorToState(e);
  }
  return { ok: true };
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
      <PageContainer size="form">
        <BackLink href="/aset/daftar" label="← Kembali ke daftar aset" />
        <PageHeader title="Aset Tetap Baru" />
        <AsetForm
          cabang={cabang}
          akunAset={akunAset} akunAkumulasi={akunAkum} akunBeban={akunBeban}
          submit={submitAset}
        />
        <CancelButton href="/aset/daftar" />
      </PageContainer>
    </>
  );
}
