import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function Index() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.tenantId) redirect('/pilih-tenant');
  redirect('/dashboard');
}
