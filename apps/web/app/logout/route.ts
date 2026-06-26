import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Route Handler untuk clear cookies session + redirect ke /login.
 * Dipanggil dari `apiFetch` saat 401 setelah refresh gagal (session expired).
 *
 * Tidak bisa lakukan ini langsung dari RSC karena `cookies().delete()` hanya
 * boleh di Server Action atau Route Handler.
 */
export async function GET(request: Request) {
  const c = await cookies();
  for (const name of ['lentera_access', 'lentera_refresh', 'lentera_user', 'lentera_tenant']) {
    c.delete(name);
  }
  const url = new URL(request.url);
  const reason = url.searchParams.get('reason') ?? 'session_expired';
  return NextResponse.redirect(new URL(`/login?${reason}=1`, request.url));
}
