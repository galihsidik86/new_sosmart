/**
 * Audit analisa vertikal + horizontal untuk Laba Rugi.
 *
 * Skenario:
 *   1) Buat jurnal manual "penjualan" Rp 1.000.000 (K 4-101 Pendapatan,
 *      D 1-101 Kas) di periode berjalan.
 *   2) Login UI → buka /laporan/laba-rugi dengan vertikal=true.
 *   3) Verifikasi: baris pendapatan tampil "100.00%" (base = total pendapatan).
 *   4) Toggle horizontal (compareToPeriodId ke periode sebelumnya) → verifikasi
 *      kolom "Sebelumnya" + "Δ" + "Δ %" muncul.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

const ACCOUNT_ID_PENJUALAN = '34d11cea-33d9-4cfb-bdf1-1fea0655e1f5'; // 4-101
const ACCOUNT_ID_KAS = '19262ed4-6bcc-4adf-96d3-44a902bc62c9';       // 1-101
const CABANG_SMG = 'b2ae94f8-5610-4d6e-97f5-ade6e49b0681';

function todayISO() { return new Date().toISOString().slice(0, 10); }

test('Laba Rugi vertikal + horizontal — tampilkan %, previous, delta', async ({ page, context }) => {
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

  // Buat + post jurnal penjualan Rp 1.000.000
  const draft = await ctx.post('/api/v1/journals', {
    headers: authHeaders,
    data: {
      cabangId: CABANG_SMG,
      tanggal: todayISO(),
      deskripsi: `Audit vertikal ${Date.now()}`,
      sumber: 'MANUAL',
      lines: [
        { accountId: ACCOUNT_ID_KAS, debit: '1000000', kredit: '0' },
        { accountId: ACCOUNT_ID_PENJUALAN, debit: '0', kredit: '1000000' },
      ],
    },
  });
  expect(draft.ok(), await draft.text()).toBeTruthy();
  const draftJ = await draft.json();
  const postRes = await ctx.post(`/api/v1/journals/${draftJ.id}/post`, {
    headers: authHeaders, data: {},
  });
  expect(postRes.ok(), await postRes.text()).toBeTruthy();

  // Ambil daftar periode untuk pilih periode ini + periode sebelumnya
  const periodsRes = await ctx.get('/api/v1/periods/years', { headers: authHeaders });
  const years = await periodsRes.json();
  const openPeriods = years[0].periods.filter((p: { status: string }) => p.status === 'OPEN');
  const currentPeriodId = draftJ.fiscalPeriodId as string;
  const idxCurrent = openPeriods.findIndex((p: { id: string }) => p.id === currentPeriodId);
  const previousPeriodId = openPeriods[idxCurrent - 1]?.id ?? openPeriods[0].id;

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

  // Vertikal aktif
  await page.goto(
    `/laporan/laba-rugi?periodId=${currentPeriodId}&vertikal=true`,
    { waitUntil: 'networkidle' },
  );
  await expect(page.getByRole('heading', { name: /Laporan Laba Rugi/i })).toBeVisible();
  const table = page.locator('table').first();
  await expect(table).toContainText('100.00%'); // Total pendapatan = base = 100%

  // Horizontal aktif (bandingkan)
  await page.goto(
    `/laporan/laba-rugi?periodId=${currentPeriodId}&vertikal=true&compareToPeriodId=${previousPeriodId}`,
    { waitUntil: 'networkidle' },
  );
  await expect(table).toContainText('Sebelumnya');
  await expect(table).toContainText('Δ');
});
