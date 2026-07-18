import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Forwarder upload bukti transaksi. Ditaruh di path NON-`/api` karena Caddy
 * mengarahkan `/api/*` langsung ke backend API — route handler web harus di
 * luar prefix itu (sama seperti `/proxy` & `/logout`). Browser tak punya access
 * token (cookie httpOnly), jadi handler ini baca token dari cookie & teruskan
 * file (multipart) ke API `/uploads/bukti`. Return { files: [{ name, url }] }.
 */
export async function POST(req: Request) {
  const c = await cookies();
  const access = c.get('lentera_access')?.value;
  if (!access) {
    return new Response(JSON.stringify({ message: 'Sesi berakhir. Silakan login ulang.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const tenantRaw = c.get('lentera_tenant')?.value;
  const tenantId = tenantRaw ? (JSON.parse(tenantRaw).tenantId as string) : undefined;

  const inForm = await req.formData();
  const upstream = new FormData();
  for (const f of inForm.getAll('file')) upstream.append('file', f as Blob);

  const headers: Record<string, string> = { authorization: `Bearer ${access}` };
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const res = await fetch(`${API_URL}/api/v1/uploads/bukti`, {
    method: 'POST',
    headers,
    body: upstream,
    cache: 'no-store',
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
