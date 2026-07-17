import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Redirect ke /logout dengan Location RELATIF. Penting: di belakang reverse
 * proxy (nginx), `req.url` memakai host internal (localhost:PORT), sehingga
 * `new URL('/logout', req.url)` menghasilkan redirect ke localhost — browser
 * jadi "mendadak akses localhost" saat sesi kedaluwarsa. Location relatif
 * di-resolve browser terhadap URL publik yang sebenarnya.
 */
function logoutRedirect() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: '/logout?reason=session_expired' },
  });
}

/**
 * Proxy untuk file download (xlsx/pdf) — browser tidak punya access token,
 * Server Route Handler ambil dari cookie httpOnly lalu forward ke API.
 * Tenant ID di-ambil dari cookie `lentera_tenant` (set saat login).
 *
 * Pakai dengan: `<a href="/proxy/items/export.xlsx">Export</a>`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const c = await cookies();
  const access = c.get('lentera_access')?.value;
  if (!access) {
    return logoutRedirect();
  }
  const tenantRaw = c.get('lentera_tenant')?.value;
  const tenantId = tenantRaw ? (JSON.parse(tenantRaw).tenantId as string) : undefined;

  // forward original query string
  const qs = req.nextUrl.search;
  const upstream = `${API_URL}/api/v1/${path.join('/')}${qs}`;

  const headers: Record<string, string> = { authorization: `Bearer ${access}` };
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const res = await fetch(upstream, { headers, cache: 'no-store' });
  if (res.status === 401) {
    return logoutRedirect();
  }
  if (!res.ok) {
    return new NextResponse(await res.text(), { status: res.status });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = new NextResponse(buf);
  // Pass through content-type & disposition dari upstream supaya browser tahu cara
  // handle (download vs preview, nama file).
  const ct = res.headers.get('content-type');
  const cd = res.headers.get('content-disposition');
  if (ct) out.headers.set('content-type', ct);
  if (cd) out.headers.set('content-disposition', cd);
  return out;
}
