import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canPostAccounting, canCancelPosted } from '@/lib/roles';
import { fmtRp, fmtTanggal } from '@/lib/format';
import { PageContainer, PageHeader, Button, StatusBanner, MoneyInput } from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { CancelButton } from '@/components/CancelButton';

interface Preview {
  runId: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  tanggal: string;
  totalDebit: string;
  totalKredit: string;
  selisih: string;
  balanced: boolean;
  totalPiutang: string;
  totalUtang: string;
  totalPersediaan: string;
  countPiutang: number;
  countUtang: number;
  countPersediaan: number;
}

interface AkunRow {
  id: string; kode: string; nama: string;
  normalBalance: 'DEBIT' | 'KREDIT'; saldoAwal: string;
}

interface PiutangRow {
  id: string; nomor: string | null; tanggal: string; totalNetto: string; status: string;
  customer: { nama: string; kode: string };
}

interface UtangRow {
  id: string; nomor: string | null; tanggal: string; totalNetto: string; status: string;
  vendor: { nama: string; kode: string };
}

interface PersediaanRow {
  id: string; tanggal: string; qty: string; hargaPokokPerUnit: string;
  item: { kode: string; nama: string };
  cabang: { kode: string };
}

interface Cabang { id: string; kode: string; nama: string }
interface Customer { id: string; kode: string; nama: string }
interface Vendor { id: string; kode: string; nama: string }
interface Item { id: string; kode: string; nama: string }

const PATH = '/pengaturan/saldo-awal';

/**
 * `apiFetch` melempar `Error("API {status}: {jsonBody}")` (lihat lib/api.ts).
 * Tanpa ini, error apa pun dari API (mis. "periode sudah ditutup") jatuh
 * sampai ke Next.js dev overlay / generic error page — user tidak pernah
 * lihat pesan yang jelas kenapa aksinya gagal.
 */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Terjadi kesalahan tak terduga.';
  const m = err.message.match(/^API \d+: (.+)$/s);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (typeof body?.message === 'string') return body.message;
    } catch {
      // bukan JSON — pakai raw text
    }
    return m[1];
  }
  return err.message;
}

/** Jalankan aksi API; kalau gagal, redirect balik ke wizard dengan ?error=... alih-alih crash. */
async function runAction(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    redirect(`${PATH}?error=${encodeURIComponent(extractErrorMessage(e))}`);
  }
  revalidatePath(PATH);
  redirect(PATH); // normalisasi URL — bersihkan ?error= lama kalau ada, dan pastikan data fresh.
}

async function setAkunAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const accountIds = formData.getAll('accountId[]') as string[];
  const nilaiList = formData.getAll('nilai[]') as string[];
  const lines = accountIds
    .map((accountId, i) => ({ accountId, nilai: nilaiList[i] ?? '0' }))
    .filter((l) => l.nilai.trim() !== '' && Number(l.nilai) !== 0);
  await runAction(() => apiFetch('/opening-balance/akun', {
    method: 'PUT', tenantId, body: JSON.stringify({ lines }),
  }));
}

async function addPiutangAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/opening-balance/piutang', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      customerId: String(formData.get('customerId')),
      cabangId: String(formData.get('cabangId')),
      tanggal: String(formData.get('tanggal')),
      nominal: String(formData.get('nominal')),
      keterangan: String(formData.get('keterangan') ?? '') || undefined,
    }),
  }));
}

async function removePiutangAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch(`/opening-balance/piutang/${String(formData.get('id'))}`, {
    method: 'DELETE', tenantId,
  }));
}

async function addUtangAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/opening-balance/utang', {
    method: 'POST', tenantId,
    body: JSON.stringify({
      vendorId: String(formData.get('vendorId')),
      cabangId: String(formData.get('cabangId')),
      tanggal: String(formData.get('tanggal')),
      nominal: String(formData.get('nominal')),
      keterangan: String(formData.get('keterangan') ?? '') || undefined,
    }),
  }));
}

async function removeUtangAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch(`/opening-balance/utang/${String(formData.get('id'))}`, {
    method: 'DELETE', tenantId,
  }));
}

async function addPersediaanAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/opening-balance/persediaan', {
    method: 'PUT', tenantId,
    body: JSON.stringify({
      lines: [{
        itemId: String(formData.get('itemId')),
        cabangId: String(formData.get('cabangId')),
        tanggal: String(formData.get('tanggal')),
        qty: String(formData.get('qty')),
        hargaPokokPerUnit: String(formData.get('hargaPokokPerUnit')),
      }],
    }),
  }));
}

async function removePersediaanAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch(`/opening-balance/persediaan/${String(formData.get('id'))}`, {
    method: 'DELETE', tenantId,
  }));
}

async function postAction() {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/opening-balance/post', { method: 'POST', tenantId }));
}

async function voidAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/opening-balance/void', {
    method: 'POST', tenantId,
    body: JSON.stringify({ alasan: String(formData.get('alasan') ?? 'Koreksi saldo awal') }),
  }));
}

export default async function SaldoAwalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const canPost = canPostAccounting(s.role);
  // Void = batalkan SATU-satunya run saldo awal tenant sekaligus (dampak
  // tenant-wide) — dibatasi OWNER/ADMIN saja (canCancelPosted), bukan ikut
  // aturan Post biasa (OWNER/ADMIN/AKUNTAN). Cuma UX hint; enforcement
  // sebenarnya di server (opening-balance.controller.ts @Roles('OWNER','ADMIN')).
  const canVoid = canCancelPosted(s.role);

  const [preview, akun, piutang, utang, persediaan, cabangList, customers, vendors, items] = await Promise.all([
    apiFetch<Preview>('/opening-balance/preview', { tenantId }),
    apiFetch<AkunRow[]>('/opening-balance/akun', { tenantId }),
    apiFetch<PiutangRow[]>('/opening-balance/piutang', { tenantId }),
    apiFetch<UtangRow[]>('/opening-balance/utang', { tenantId }),
    apiFetch<PersediaanRow[]>('/opening-balance/persediaan', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<Customer[]>('/customers', { tenantId }),
    apiFetch<Vendor[]>('/vendors', { tenantId }),
    apiFetch<Item[]>('/items', { tenantId }),
  ]);

  const isDraft = preview.status === 'DRAFT';
  const isPosted = preview.status === 'POSTED';
  const akunNonZero = akun.filter((a) => Number(a.saldoAwal) !== 0);

  return (
    <>
      <PageContainer size="wide">
        <BackLink href="/dashboard" label="← Kembali ke Dashboard" />
        <PageHeader
          title="Prosedur Saldo Awal Terintegrasi"
          subtitle={
            <>
              Input saldo awal akun, piutang per pelanggan, utang per vendor, dan
              persediaan per barang di satu tempat — sistem cross-check otomatis
              supaya Debit = Kredit sebelum bisa diposting. Tanggal cutover:{' '}
              <strong>{fmtTanggal(preview.tanggal)}</strong>.
            </>
          }
        />

        {error && (
          <StatusBanner tone="danger" className="mb-6">
            <span><strong>Gagal: </strong>{error}</span>
          </StatusBanner>
        )}

        {/* Ringkasan cross-check */}
        <div
          className={`rounded-xl border p-5 mb-6 ${
            preview.balanced
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="text-tanah-500 text-xs uppercase tracking-wide">Total Debit</div>
                <div className="font-mono font-semibold text-lg">{fmtRp(preview.totalDebit)}</div>
              </div>
              <div>
                <div className="text-tanah-500 text-xs uppercase tracking-wide">Total Kredit</div>
                <div className="font-mono font-semibold text-lg">{fmtRp(preview.totalKredit)}</div>
              </div>
              <div>
                <div className="text-tanah-500 text-xs uppercase tracking-wide">Selisih</div>
                <div className={`font-mono font-bold text-lg ${preview.balanced ? 'text-green-700' : 'text-red-700'}`}>
                  {preview.balanced ? 'Rp 0 ✓ Balance' : fmtRp(preview.selisih)}
                </div>
              </div>
            </div>
            <div className="text-xs text-tanah-600">
              Status: <strong>{preview.status}</strong> · {preview.countPiutang} piutang ·{' '}
              {preview.countUtang} utang · {preview.countPersediaan} baris persediaan
            </div>
          </div>

          {isDraft && canPost && (
            <form action={postAction} className="mt-4">
              <Button type="submit" disabled={!preview.balanced}>
                Posting & Kunci Saldo Awal
              </Button>
              <CancelButton href="/dashboard" className="ml-2" />
              {!preview.balanced && (
                <p className="text-xs text-red-600 mt-2">
                  Selisihkan dulu Debit dan Kredit sebelum bisa posting.
                </p>
              )}
            </form>
          )}
          {isPosted && canVoid && (
            <form action={voidAction} className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-tanah-500">Alasan void (untuk koreksi)</label>
                <input
                  name="alasan" required minLength={5}
                  className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="mis. salah input saldo awal, perlu koreksi"
                />
              </div>
              <Button type="submit" variant="soft-bata">Void & Buka Kunci</Button>
            </form>
          )}
        </div>

        {isPosted && (
          <p className="text-sm text-tanah-600 mb-6">
            Saldo awal sudah diposting dan terkunci. Cek Neraca Saldo untuk verifikasi akun
            "Saldo Awal — Ekuitas Kliring" bersaldo Rp 0. Untuk koreksi, void dulu di atas.
          </p>
        )}

        {/* Akun manual */}
        <Section title="1. Akun Manual (Kas, Bank, Aset Tetap, Modal, dll)">
          <form action={setAkunAction}>
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-tanah-500 border-b border-cream-200">
                  <th className="py-2">Kode</th>
                  <th className="py-2">Nama Akun</th>
                  <th className="py-2 w-24">Normal</th>
                  <th className="py-2 w-48 text-right">Saldo Awal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {akun.map((a) => (
                  <tr key={a.id}>
                    <td className="py-1.5 font-mono text-xs">{a.kode}</td>
                    <td className="py-1.5">{a.nama}</td>
                    <td className="py-1.5 text-xs text-tanah-500">{a.normalBalance}</td>
                    <td className="py-1.5">
                      <input type="hidden" name="accountId[]" value={a.id} />
                      <MoneyInput name="nilai[]" defaultValue={a.saldoAwal} disabled={!isDraft} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isDraft && (
              <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-wedel-100 text-wedel-800 hover:bg-wedel-200">
                Simpan Saldo Akun
              </button>
            )}
          </form>
          {akunNonZero.length === 0 && (
            <p className="text-xs text-tanah-500 mt-2">Belum ada saldo awal akun manual diisi.</p>
          )}
        </Section>

        {/* Piutang */}
        <Section title="2. Piutang per Pelanggan">
          <RowTable
            headers={['Pelanggan', 'Tanggal', 'Nominal', 'Status', '']}
            rows={piutang.map((p) => [
              `${p.customer.kode} — ${p.customer.nama}`,
              fmtTanggal(p.tanggal),
              fmtRp(p.totalNetto),
              p.status,
              isDraft ? <DeleteButton key={p.id} id={p.id} action={removePiutangAction} /> : null,
            ])}
          />
          {isDraft && (
            <form action={addPiutangAction} className="mt-3 grid grid-cols-5 gap-2 items-end">
              <Field label="Pelanggan">
                <select name="customerId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>)}
                </select>
              </Field>
              <Field label="Cabang">
                <select name="cabangId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {cabangList.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
                </select>
              </Field>
              <Field label="Tanggal">
                <input type="date" name="tanggal" required defaultValue={preview.tanggal.slice(0, 10)} className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Nominal">
                <MoneyInput name="nominal" required />
              </Field>
              <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-wedel-100 text-wedel-800 hover:bg-wedel-200 h-fit">+ Tambah</button>
            </form>
          )}
        </Section>

        {/* Utang */}
        <Section title="3. Utang per Vendor">
          <RowTable
            headers={['Vendor', 'Tanggal', 'Nominal', 'Status', '']}
            rows={utang.map((u) => [
              `${u.vendor.kode} — ${u.vendor.nama}`,
              fmtTanggal(u.tanggal),
              fmtRp(u.totalNetto),
              u.status,
              isDraft ? <DeleteButton key={u.id} id={u.id} action={removeUtangAction} /> : null,
            ])}
          />
          {isDraft && (
            <form action={addUtangAction} className="mt-3 grid grid-cols-5 gap-2 items-end">
              <Field label="Vendor">
                <select name="vendorId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.kode} — {v.nama}</option>)}
                </select>
              </Field>
              <Field label="Cabang">
                <select name="cabangId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {cabangList.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
                </select>
              </Field>
              <Field label="Tanggal">
                <input type="date" name="tanggal" required defaultValue={preview.tanggal.slice(0, 10)} className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Nominal">
                <MoneyInput name="nominal" required />
              </Field>
              <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-wedel-100 text-wedel-800 hover:bg-wedel-200 h-fit">+ Tambah</button>
            </form>
          )}
        </Section>

        {/* Persediaan */}
        <Section title="4. Persediaan per Barang">
          <RowTable
            headers={['Barang', 'Cabang', 'Tanggal', 'Qty', 'Harga Pokok/Unit', '']}
            rows={persediaan.map((p) => [
              `${p.item.kode} — ${p.item.nama}`,
              p.cabang.kode,
              fmtTanggal(p.tanggal),
              p.qty,
              fmtRp(p.hargaPokokPerUnit),
              isDraft ? <DeleteButton key={p.id} id={p.id} action={removePersediaanAction} /> : null,
            ])}
          />
          {isDraft && (
            <form action={addPersediaanAction} className="mt-3 grid grid-cols-6 gap-2 items-end">
              <Field label="Barang">
                <select name="itemId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {items.map((i) => <option key={i.id} value={i.id}>{i.kode} — {i.nama}</option>)}
                </select>
              </Field>
              <Field label="Cabang">
                <select name="cabangId" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm">
                  {cabangList.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
                </select>
              </Field>
              <Field label="Tanggal">
                <input type="date" name="tanggal" required defaultValue={preview.tanggal.slice(0, 10)} className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Qty">
                <input type="number" step="0.0001" name="qty" required className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Harga Pokok/Unit">
                <MoneyInput name="hargaPokokPerUnit" required />
              </Field>
              <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-wedel-100 text-wedel-800 hover:bg-wedel-200 h-fit">+ Tambah</button>
            </form>
          )}
        </Section>
      </PageContainer>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5 mb-5">
      <h2 className="font-semibold text-wedel-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-tanah-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function DeleteButton({ id, action }: { id: string; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-red-600 hover:underline">Hapus</button>
    </form>
  );
}

function RowTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-tanah-500">Belum ada baris.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-tanah-500 border-b border-cream-200">
          {headers.map((h) => <th key={h} className="py-2">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-cream-100">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => <td key={j} className="py-1.5">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
