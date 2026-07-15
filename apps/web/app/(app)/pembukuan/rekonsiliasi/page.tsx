import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select,
  Table, THead, TH, TBody, TR, TD, EmptyRow, SectionHeader,
} from '@/components/ui';

interface AkunKasBank { id: string; kode: string; nama: string }
interface ReconRow {
  id: string;
  tanggal: string;
  saldoRekeningKoran: string;
  status: 'DRAFT' | 'SELESAI';
  akun: { kode: string; nama: string };
  _count: { lines: number };
}

async function createRecon(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const r = await apiFetch<{ id: string }>('/bank-reconciliation', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      akunId: formData.get('akunId'),
      tanggal: formData.get('tanggal'),
      saldoRekeningKoran: String(formData.get('saldoRekeningKoran') ?? '0'),
    }),
  });
  revalidatePath('/pembukuan/rekonsiliasi');
  redirect(`/pembukuan/rekonsiliasi/${r.id}` as Route);
}

export default async function RekonsiliasiListPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [list, akun] = await Promise.all([
    apiFetch<ReconRow[]>('/bank-reconciliation', { tenantId }),
    apiFetch<AkunKasBank[]>('/bank-reconciliation/akun-kas-bank', { tenantId }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageContainer size="list">
      <PageHeader
        title="Rekonsiliasi Bank"
        subtitle="Cocokkan saldo buku akun kas/bank terhadap saldo per rekening koran, centang transaksi yang sudah kliring, dan temukan selisih."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <Table>
            <THead>
              <TH>Akun</TH>
              <TH>Tgl Rekening Koran</TH>
              <TH numeric>Saldo Bank</TH>
              <TH className="text-center">Cleared</TH>
              <TH className="text-center">Status</TH>
              <TH numeric className="w-16" />
            </THead>
            <TBody>
              {list.length === 0 && <EmptyRow colSpan={6}>Belum ada rekonsiliasi.</EmptyRow>}
              {list.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="font-mono text-xs text-tanah-500">{r.akun.kode}</span>{' '}
                    <span className="text-tanah-700">{r.akun.nama}</span>
                  </TD>
                  <TD className="text-tanah-700">{fmtTanggal(r.tanggal)}</TD>
                  <TD className="text-right font-mono tabular-nums">{fmtRp(r.saldoRekeningKoran)}</TD>
                  <TD className="text-center text-tanah-500">{r._count.lines}</TD>
                  <TD className="text-center">
                    <Badge variant={r.status === 'SELESAI' ? 'success' : 'neutral'}>{r.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/pembukuan/rekonsiliasi/${r.id}` as Route}
                      className="text-xs text-sogan-500 font-semibold hover:underline"
                    >
                      Buka
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <aside>
          <Card padding="lg">
            <SectionHeader className="mb-4">Rekonsiliasi Baru</SectionHeader>
            {akun.length === 0 ? (
              <p className="text-sm text-tanah-500">
                Belum ada akun kas/bank. Tandai akun sebagai <b>Kas &amp; setara kas</b> di
                Bagan Akun dulu.
              </p>
            ) : (
              <form action={createRecon} className="space-y-4">
                <FormField label="Akun Kas/Bank" required>
                  <Select name="akunId" required className="font-mono">
                    {akun.map((a) => (
                      <option key={a.id} value={a.id}>{a.kode} — {a.nama}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Tanggal Rekening Koran" required>
                  <Input type="date" name="tanggal" required defaultValue={today} />
                </FormField>
                <FormField label="Saldo Akhir per Rekening Koran (Rp)" required>
                  <Input numeric type="number" step="0.01" name="saldoRekeningKoran" required defaultValue="0" />
                </FormField>
                <Button type="submit" className="w-full">Mulai Rekonsiliasi</Button>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
