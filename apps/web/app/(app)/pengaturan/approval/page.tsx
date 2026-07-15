import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';
import {
  PageContainer, PageHeader, Card, Button, Badge, FormField, Input, Select,
  SectionHeader, Table, THead, TH, TBody, TR, TD, EmptyRow,
} from '@/components/ui';

const DOC_LABEL: Record<string, string> = {
  PENJUALAN: 'Penjualan',
  PEMBELIAN: 'Pembelian',
  KAS_BANK: 'Kas/Bank (keluar)',
  JURNAL: 'Jurnal manual',
};
const ROLE_OPTS = ['OWNER', 'ADMIN', 'AKUNTAN'];

interface Step { urutan: number; approverRole: string; approverUserId: string | null; approverNama: string | null }
interface Rule {
  id: string; docType: string; minAmount: string; isActive: boolean; catatan: string | null; steps: Step[];
}
interface UserRow { userId: string; nama: string; role: string }

async function createRuleAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  // Tiap langkah: "role:ADMIN" atau "user:<uuid>".
  const steps = [formData.get('step1'), formData.get('step2'), formData.get('step3')]
    .map((v) => String(v ?? ''))
    .filter((v) => v)
    .map((v) => (v.startsWith('user:') ? { userId: v.slice(5) } : { role: v.slice(5) }));
  await apiFetch('/approval/rules', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      docType: formData.get('docType'),
      minAmount: String(formData.get('minAmount') ?? '0'),
      steps,
    }),
  });
  revalidatePath('/pengaturan/approval');
}

async function deleteRuleAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch(`/approval/rules/${formData.get('id')}`, { method: 'DELETE', tenantId });
  revalidatePath('/pengaturan/approval');
}

export default async function ApprovalRulesPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [rules, users] = await Promise.all([
    apiFetch<Rule[]>('/approval/rules', { tenantId }),
    apiFetch<UserRow[]>('/users', { tenantId }),
  ]);

  return (
    <PageContainer size="list">
      <PageHeader
        title="Aturan Approval Berjenjang"
        subtitle="Dokumen dengan nilai ≥ ambang wajib melewati persetujuan berurutan sebelum bisa diposting. Aturan dengan ambang tertinggi yang cocok akan dipakai."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <Table>
            <THead>
              <TH>Dokumen</TH>
              <TH numeric>Ambang (≥)</TH>
              <TH>Rantai persetujuan</TH>
              <TH numeric className="w-16" />
            </THead>
            <TBody>
              {rules.length === 0 && <EmptyRow colSpan={4}>Belum ada aturan — semua dokumen bisa langsung diposting.</EmptyRow>}
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="text-tanah-700">{DOC_LABEL[r.docType] ?? r.docType}</TD>
                  <TD className="text-right font-mono tabular-nums">{fmtRp(r.minAmount)}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.steps.map((st) => (
                        <Badge key={st.urutan} variant={st.approverUserId ? 'brand' : 'neutral'}>
                          {st.urutan}. {st.approverNama ? `👤 ${st.approverNama}` : st.approverRole}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <form action={deleteRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs text-bata-500 font-semibold hover:underline">Hapus</button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <aside>
          <Card padding="lg">
            <SectionHeader className="mb-4">Aturan Baru</SectionHeader>
            <form action={createRuleAction} className="space-y-4">
              <FormField label="Jenis Dokumen" required>
                <Select name="docType" required>
                  {Object.entries(DOC_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Ambang nilai minimum (Rp)" required>
                <Input numeric type="number" step="0.01" name="minAmount" required defaultValue="0" />
              </FormField>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-tanah-500 font-bold">Rantai persetujuan (berurutan)</div>
                {[1, 2, 3].map((n) => (
                  <FormField key={n} label={`Tingkat ${n}${n > 1 ? ' (opsional)' : ''}`}>
                    <Select name={`step${n}`} defaultValue={n === 1 ? 'role:ADMIN' : ''}>
                      <option value="">— tidak ada —</option>
                      <optgroup label="Berdasarkan role">
                        {ROLE_OPTS.map((role) => <option key={role} value={`role:${role}`}>{role}</option>)}
                      </optgroup>
                      <optgroup label="User spesifik">
                        {users.map((u) => <option key={u.userId} value={`user:${u.userId}`}>👤 {u.nama} ({u.role})</option>)}
                      </optgroup>
                    </Select>
                  </FormField>
                ))}
              </div>
              <Button type="submit" className="w-full">Simpan Aturan</Button>
              <p className="text-[11px] text-tanah-500">
                Catatan: OWNER selalu boleh menyetujui langkah apa pun (mencegah macet).
              </p>
            </form>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
