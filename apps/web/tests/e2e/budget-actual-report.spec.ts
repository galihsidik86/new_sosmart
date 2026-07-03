/**
 * Audit Fase F — laporan Budget vs Actual.
 *
 * Skenario:
 *   1) Setup via API: buat project + budget 500.000 pada akun 6-104 pada
 *      periode berjalan → post 1 jurnal Rp 200.000 di bucket sama (utilisasi 40%).
 *   2) Buka /laporan/budget-actual → filter periode + project.
 *   3) Verifikasi baris memuat: kode akun, budget, actual, variance, status OK,
 *      utilisasi 40%.
 *   4) Naikkan actual dengan jurnal tambahan Rp 300.000 → total 500.000 (util 100%
 *      → status WARNING karena > 80).
 *   5) Refresh, verifikasi update.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

const ACCOUNT_ID_6104 = '81ccfeb0-f4b5-481f-b0ee-0b0e67202bfb'; // 6-104 Beban Pemasaran
const ACCOUNT_ID_KAS = '19262ed4-6bcc-4adf-96d3-44a902bc62c9';  // 1-101 Kas
const CABANG_SMG = 'b2ae94f8-5610-4d6e-97f5-ade6e49b0681';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function periodeNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Ctx {
  ctx: APIRequestContext;
  tenantId: string;
  auth: Record<string, string>;
}

async function apiLogin(): Promise<Ctx> {
  const ctx = await pwRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.post('/api/v1/auth/login', {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
  const body = await res.json();
  const tenantId = body.memberships[0].tenantId as string;
  return {
    ctx,
    tenantId,
    auth: {
      authorization: `Bearer ${body.accessToken}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    },
  };
}

async function seedProjectBudget(c: Ctx, amount: string) {
  const kode = `AUDIT-F-${Date.now().toString().slice(-6)}`;
  const projRes = await c.ctx.post('/api/v1/projects', {
    headers: c.auth,
    data: { kode, nama: `Audit F ${kode}`, tanggalMulai: todayISO() },
  });
  expect(projRes.ok(), await projRes.text()).toBeTruthy();
  const project = await projRes.json();

  const budgetRes = await c.ctx.post(`/api/v1/projects/${project.id}/budgets`, {
    headers: c.auth,
    data: { accountId: ACCOUNT_ID_6104, periode: periodeNow(), amount, hardBlock: false },
  });
  expect(budgetRes.ok(), await budgetRes.text()).toBeTruthy();
  return { projectId: project.id, projectKode: kode };
}

async function postJurnal(c: Ctx, projectId: string, nilai: string) {
  const draftRes = await c.ctx.post('/api/v1/journals', {
    headers: c.auth,
    data: {
      cabangId: CABANG_SMG,
      tanggal: todayISO(),
      deskripsi: `Audit F actual ${nilai}`,
      sumber: 'MANUAL',
      lines: [
        { accountId: ACCOUNT_ID_6104, projectId, debit: nilai, kredit: '0' },
        { accountId: ACCOUNT_ID_KAS, debit: '0', kredit: nilai },
      ],
    },
  });
  expect(draftRes.ok(), await draftRes.text()).toBeTruthy();
  const draft = await draftRes.json();
  const postRes = await c.ctx.post(`/api/v1/journals/${draft.id}/post`, {
    headers: c.auth,
    data: {},
  });
  expect(postRes.ok(), await postRes.text()).toBeTruthy();
}

test('Budget vs Actual — utilisasi tampil sesuai realisasi jurnal', async ({ page, context }) => {
  const c = await apiLogin();
  const { projectId, projectKode } = await seedProjectBudget(c, '500000');
  await postJurnal(c, projectId, '200000');

  // UI login
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
      value: JSON.stringify({ tenantId: c.tenantId, tenantNama: 'PT Sinar Niaga Sentosa', role: 'OWNER' }),
      url: 'http://localhost:3000',
    },
  ]);

  // Filter by our project + periode berjalan
  await page.goto(
    `/laporan/budget-actual?periode=${periodeNow()}&projectId=${projectId}`,
    { waitUntil: 'networkidle' },
  );
  await expect(page.getByRole('heading', { name: /Budget vs Actual/i })).toBeVisible();
  const table = page.locator('table').first();
  await expect(table).toContainText(projectKode);
  await expect(table).toContainText('6-104');
  await expect(table).toContainText('500.000');   // budget
  await expect(table).toContainText('200.000');   // actual
  await expect(table).toContainText('300.000');   // variance
  await expect(table).toContainText('40%');
  await expect(page.getByText(/^OK$/).first()).toBeVisible();

  // ---- Tambah realisasi 300.000 → total 500.000, utilisasi 100% → status WARNING
  await postJurnal(c, projectId, '300000');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(table).toContainText('100%');
  // Variance 0 (budget habis)
  const varianceCell = table.locator('tr:has-text("6-104") td').nth(3);
  await expect(varianceCell).toContainText('0');
  await expect(page.getByText(/^WARNING$/).first()).toBeVisible();
});
