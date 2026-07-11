'use server';

import { redirect } from 'next/navigation';
import { clearSession } from './session';

/** Server action logout — dipakai oleh Topbar (client) sebagai form action. */
export async function logoutAction() {
  await clearSession();
  redirect('/login');
}
