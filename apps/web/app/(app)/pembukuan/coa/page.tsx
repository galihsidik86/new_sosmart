import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { Topbar } from '@/components/Topbar';
import { ImportExcelButton } from '@/components/ImportExcelButton';
import { apiFetch } from '@/lib/api';
import { uploadXlsx } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { fmtRp } from '@/lib/format';

async function importAccountsAction(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadXlsx('/accounts/import', file);
  revalidatePath('/pembukuan/coa');
  return result;
}

interface AccountNode {
  id: string;
  kode: string;
  nama: string;
  kind: string;
  normalBalance: 'DEBIT' | 'KREDIT';
  isPostable: boolean;
  saldoAwal: string;
  children: AccountNode[];
}

export default async function CoaPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const tree = await apiFetch<AccountNode[]>('/accounts?view=tree', { tenantId });

  return (
    <>
      <Topbar breadcrumb="Bagan Akun" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-wedel-900">
              Bagan Akun (Chart of Accounts)
            </h1>
            <p className="text-sm text-tanah-500 mt-1">
              Hierarki akun standar perusahaan dagang Indonesia.
              Hanya akun <em>postable</em> (leaf) yang bisa dijurnal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/proxy/accounts/export.xlsx"
              className="px-3 py-2 bg-padi-100 hover:bg-padi-200 border border-padi-300 rounded-lg text-sm font-semibold text-padi-700"
            >
              Export Excel
            </a>
            <ImportExcelButton importAction={importAccountsAction} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-tanah-500">
                <th className="px-4 py-3 font-bold">Kode</th>
                <th className="px-4 py-3 font-bold">Nama Akun</th>
                <th className="px-4 py-3 font-bold">Jenis</th>
                <th className="px-4 py-3 font-bold text-center">Saldo Normal</th>
                <th className="px-4 py-3 font-bold text-right">Saldo Awal</th>
                <th className="px-4 py-3 font-bold text-right w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {tree.flatMap((n) => renderRow(n, 0))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function renderRow(n: AccountNode, depth: number): React.ReactNode[] {
  const rows: React.ReactNode[] = [
    <tr key={n.id} className={depth === 0 ? 'bg-cream-50' : ''}>
      <td
        className="px-4 py-2 font-mono text-tanah-700"
        style={{ paddingLeft: 16 + depth * 16 }}
      >
        {n.kode}
      </td>
      <td className="px-4 py-2">
        <span className={depth === 0 ? 'font-bold uppercase tracking-wide text-wedel-900' : !n.isPostable ? 'font-semibold text-tanah-700' : 'text-tanah-700'}>
          {n.nama}
        </span>
        {!n.isPostable && (
          <span className="ml-2 text-[10px] text-tanah-400 uppercase">induk</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-tanah-500">{n.kind}</td>
      <td className="px-4 py-2 text-center">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            n.normalBalance === 'DEBIT'
              ? 'bg-padi-100 text-padi-700'
              : 'bg-sogan-50 text-sogan-500'
          }`}
        >
          {n.normalBalance}
        </span>
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap text-tanah-700">
        {Number(n.saldoAwal) > 0 ? fmtRp(n.saldoAwal) : ''}
      </td>
      <td className="px-4 py-2 text-right">
        <Link
          href={`/pembukuan/coa/${n.id}/edit` as Route}
          className="text-xs text-sogan-500 font-semibold hover:underline"
        >
          Edit
        </Link>
      </td>
    </tr>,
  ];
  for (const child of n.children ?? []) {
    rows.push(...renderRow(child, depth + 1));
  }
  return rows;
}
