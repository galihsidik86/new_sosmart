import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp, fmtTanggal } from '@/lib/format';

type Status = 'AKTIF' | 'SELESAI' | 'DIBATALKAN';

interface ProjectRow {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  budgetTotal: string | null;
  _count: { members: number; budgets: number };
}

async function createProjectAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await apiFetch('/projects', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      kode: String(formData.get('kode') ?? ''),
      nama: String(formData.get('nama') ?? ''),
      deskripsi: String(formData.get('deskripsi') ?? '') || undefined,
      tanggalMulai: String(formData.get('tanggalMulai') ?? ''),
      tanggalSelesai: String(formData.get('tanggalSelesai') ?? '') || undefined,
      budgetTotal: String(formData.get('budgetTotal') ?? '') || undefined,
    }),
  });
  revalidatePath('/master/project');
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ semua?: string }>;
}) {
  const sp = await searchParams;
  const includeSelesai = sp.semua === '1';
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const projects = await apiFetch<ProjectRow[]>(
    `/projects${includeSelesai ? '?includeSelesai=true' : ''}`,
    { tenantId },
  );

  return (
    <>
      <Topbar breadcrumb="Master Data › Project" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Project
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              {projects.length} project · {includeSelesai ? 'termasuk yang selesai' : 'aktif saja'}
            </p>
          </div>
          <Link
            href={(includeSelesai ? '/master/project' : '/master/project?semua=1') as Route}
            className="text-sm text-sogan-500 hover:underline mt-2"
          >
            {includeSelesai ? 'sembunyikan yang selesai' : 'tampilkan yang selesai'}
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                  <th className="px-4 py-3 font-bold">Kode / Nama</th>
                  <th className="px-4 py-3 font-bold">Periode</th>
                  <th className="px-4 py-3 font-bold text-right">Budget Total</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                  <th className="px-4 py-3 font-bold text-center">Member</th>
                  <th className="px-4 py-3 font-bold text-right w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-cream-50">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-tanah-700">{p.nama}</div>
                      <div className="text-xs text-tanah-500 font-mono">{p.kode}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-tanah-500">
                      {fmtTanggal(p.tanggalMulai)}
                      {p.tanggalSelesai && <> – {fmtTanggal(p.tanggalSelesai)}</>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {p.budgetTotal ? fmtRp(p.budgetTotal) : <span className="text-tanah-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-tanah-500">
                      {p._count.members}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/master/project/${p.id}` as Route}
                        className="text-xs text-sogan-500 font-semibold hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-tanah-500">
                      Belum ada project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <aside className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
            <h2 className="font-semibold text-tanah-700 mb-3">Tambah Project</h2>
            <form action={createProjectAction} className="space-y-3 text-sm">
              <FF label="Kode" name="kode" required placeholder="PRJ-001" />
              <FF label="Nama Project" name="nama" required />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
                  Deskripsi
                </label>
                <textarea
                  name="deskripsi"
                  rows={2}
                  className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
                />
              </div>
              <FF label="Tanggal Mulai" name="tanggalMulai" type="date" required />
              <FF label="Tanggal Selesai" name="tanggalSelesai" type="date" />
              <FF label="Budget Total (opsional)" name="budgetTotal" type="number" placeholder="0" />
              <button className="w-full py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                Tambah Project
              </button>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const m: Record<Status, string> = {
    AKTIF: 'bg-padi-100 text-padi-700',
    SELESAI: 'bg-cream-100 text-tanah-700',
    DIBATALKAN: 'bg-bata-100 text-bata-700 line-through',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${m[status]}`}>
      {status}
    </span>
  );
}

function FF(props: { label: string; name: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}
        {props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input
        name={props.name}
        type={props.type ?? 'text'}
        required={props.required}
        placeholder={props.placeholder}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}
