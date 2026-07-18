import Link from 'next/link';
import type { Route } from 'next';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, buttonClass } from '@/components/ui';
import { ProjectListView, type ProjectRow } from '@/components/ProjectListView';

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
      <PageContainer size="list">
        <PageHeader
          title="Project"
          subtitle={`${projects.length} project · ${includeSelesai ? 'termasuk yang selesai' : 'aktif saja'}`}
          actions={
            <div className="flex items-center gap-3">
              <Link
                href={(includeSelesai ? '/master/project' : '/master/project?semua=1') as Route}
                className="text-sm text-sogan-500 hover:underline"
              >
                {includeSelesai ? 'sembunyikan yang selesai' : 'tampilkan yang selesai'}
              </Link>
              <Link href="/master/project/baru" className={buttonClass('primary', 'sm')}>
                + Tambah Project
              </Link>
            </div>
          }
        />

        <ProjectListView
          projects={projects}
          orgName={s.tenantNama ?? 'Perusahaan'}
          includeSelesai={includeSelesai}
        />
      </PageContainer>
    </>
  );
}
