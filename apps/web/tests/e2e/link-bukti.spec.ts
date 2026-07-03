/**
 * Audit "Link Bukti Transaksi".
 * Buat draft jurnal manual + link bukti via API, buka halaman detail dan
 * daftar, verifikasi hyperlink tampil dan href-nya sama.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

const ACCOUNT_ID_6104 = '81ccfeb0-f4b5-481f-b0ee-0b0e67202bfb';
const ACCOUNT_ID_KAS = '19262ed4-6bcc-4adf-96d3-44a902bc62c9';
const CABANG_SMG = 'b2ae94f8-5610-4d6e-97f5-ade6e49b0681';

const BUKTI_URL = `https://drive.google.com/file/d/AUDIT-BUKTI-${Date.now()}/view`;

function todayISO() { return new Date().toISOString().slice(0, 10); }

test('Jurnal — field linkBukti tersimpan + tampil sebagai hyperlink', async ({ page, context }) => {
  // Setup via API: bikin draft jurnal dengan linkBukti terisi
  const ctx = await pwRequest.newContext({ baseURL: API_BASE });
  const login = await ctx.post('/api/v1/auth/login', {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  const auth = await login.json();
  const tenantId = auth.memberships[0].tenantId as string;
  const authHeaders = {
    authorization: `Bearer ${auth.accessToken}`,
    'x-tenant-id': tenantId,
    'content-type': 'application/json',
  };

  const jurnalRes = await ctx.post('/api/v1/journals', {
    headers: authHeaders,
    data: {
      cabangId: CABANG_SMG,
      tanggal: todayISO(),
      deskripsi: `Audit linkBukti ${Date.now()}`,
      linkBukti: BUKTI_URL,
      sumber: 'MANUAL',
      lines: [
        { accountId: ACCOUNT_ID_6104, debit: '100000', kredit: '0' },
        { accountId: ACCOUNT_ID_KAS, debit: '0', kredit: '100000' },
      ],
    },
  });
  expect(jurnalRes.ok(), await jurnalRes.text()).toBeTruthy();
  const jurnal = await jurnalRes.json();
  expect(jurnal.linkBukti).toBe(BUKTI_URL);
  const jurnalPeriodId = jurnal.fiscalPeriodId as string;

  // UI login + tenant cookie
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/pilih-cabang|\/pembukuan|\/dashboard|\/$/),
    page.getByRole('button', { name: /masuk/i }).click(),
  ]);
  await context.addCookies([
    {
      name: 'lentera_tenant',
      value: JSON.stringify({ tenantId, tenantNama: 'PT Sinar Niaga Sentosa', role: 'OWNER' }),
      url: 'http://localhost:3000',
    },
  ]);

  // ---- Halaman detail: link bukti tampil sebagai <a target=_blank>
  await page.goto(`/pembukuan/jurnal/${jurnal.id}`, { waitUntil: 'networkidle' });
  const detailLink = page.locator(`a[href="${BUKTI_URL}"]`).first();
  await expect(detailLink).toBeVisible();
  await expect(detailLink).toHaveAttribute('target', '_blank');
  await expect(detailLink).toHaveAttribute('rel', /noreferrer/);

  // ---- Halaman daftar jurnal: ikon link muncul di kolom Bukti.
  // List page default filter ke periode OPEN pertama; kita override ke periode jurnal.
  await page.goto(`/pembukuan/jurnal?periodId=${jurnalPeriodId}`, { waitUntil: 'networkidle' });
  const rowLink = page.locator(`a[href="${BUKTI_URL}"]`).first();
  await expect(rowLink).toBeVisible();
  await expect(rowLink).toHaveAttribute('target', '_blank');
});
