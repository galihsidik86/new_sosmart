/**
 * Audit Fase E — enforcement budget saat POST + override step-up di 4 detail page:
 *   - /pembukuan/jurnal/[id]
 *   - /transaksi/penjualan/[id]
 *   - /transaksi/pembelian/[id]
 *   - /transaksi/kas-bank/[id]
 *
 * Semuanya lewat backend path yang sama (JournalsService.postInTx →
 * BudgetGuardService), tapi masing-masing halaman punya server-action wrapper
 * sendiri. Audit ini memastikan tiap halaman: (1) tangkap 409 BudgetExceeded,
 * (2) buka modal violations, (3) sukses override dengan alasan + kredensial
 * OWNER.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

const ACCOUNT_ID_6104 = '81ccfeb0-f4b5-481f-b0ee-0b0e67202bfb'; // 6-104 Beban Pemasaran (BEBAN, debit-normal)
const ACCOUNT_ID_KAS = '19262ed4-6bcc-4adf-96d3-44a902bc62c9'; // 1-101 Kas
const ACCOUNT_ID_AR = 'b2706a87-88fc-4716-9480-cd86b6f55911'; // 1-103 Piutang Usaha
const ACCOUNT_ID_PENJUALAN = '34d11cea-33d9-4cfb-bdf1-1fea0655e1f5'; // 4-101 Penjualan Barang Dagang (PENDAPATAN, kredit-normal)
const ACCOUNT_ID_AP = 'bf0862e0-ba37-4f73-8357-df67bf957b3d'; // 2-101 Utang Usaha
const CABANG_SMG = 'b2ae94f8-5610-4d6e-97f5-ade6e49b0681';
const CUSTOMER_ID = '07950cdd-c384-4d2a-a7ba-641edb4eb3ed'; // PLG-001 CV Berkah Jaya Mandiri
const VENDOR_ID = 'bae60450-237c-4be3-a127-bdf3cefed83e';   // VEN-003 CV Kemasan Prima

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function periodeNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface AuthedCtx {
  ctx: APIRequestContext;
  accessToken: string;
  tenantId: string;
  auth: Record<string, string>;
}

async function apiLogin(): Promise<AuthedCtx> {
  const ctx = await pwRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.post('/api/v1/auth/login', {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  const tenantId = body.memberships[0].tenantId as string;
  return {
    ctx,
    accessToken: body.accessToken as string,
    tenantId,
    auth: {
      authorization: `Bearer ${body.accessToken}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    },
  };
}

/**
 * Buat project + budget kecil di akun target. Return projectId + kode.
 */
async function seedProjectBudget(
  c: AuthedCtx,
  accountId: string,
  budgetRp: string,
): Promise<{ projectId: string; projectKode: string }> {
  const kode = `AUDIT-E-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
  const projRes = await c.ctx.post('/api/v1/projects', {
    headers: c.auth,
    data: {
      kode,
      nama: `Audit ${kode}`,
      tanggalMulai: todayISO(),
      budgetTotal: '10000000',
    },
  });
  expect(projRes.ok(), `Create project failed: ${await projRes.text()}`).toBeTruthy();
  const project = await projRes.json();

  const budgetRes = await c.ctx.post(`/api/v1/projects/${project.id}/budgets`, {
    headers: c.auth,
    data: { accountId, periode: periodeNow(), amount: budgetRp, hardBlock: true },
  });
  expect(budgetRes.ok(), `Set budget failed: ${await budgetRes.text()}`).toBeTruthy();
  return { projectId: project.id, projectKode: kode };
}

/**
 * Login lewat UI + set cookie tenant supaya server-component action punya konteks tenant.
 */
async function uiLoginAsOwner(page: import('@playwright/test').Page, ctx: import('@playwright/test').BrowserContext, tenantId: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/pilih-cabang|\/pembukuan|\/master|\/dashboard|\/$/),
    page.getByRole('button', { name: /masuk/i }).click(),
  ]);
  await ctx.addCookies([
    {
      name: 'lentera_tenant',
      value: JSON.stringify({ tenantId, tenantNama: 'PT Sinar Niaga Sentosa', role: 'OWNER' }),
      url: 'http://localhost:3000',
    },
  ]);
}

async function fillModalAndSubmit(
  page: import('@playwright/test').Page,
  alasan: string,
) {
  await page.locator('textarea[name="alasan"]').fill(alasan);
  await page.locator('input[name="approverEmail"]').fill(OWNER_EMAIL);
  await page.locator('input[name="approverPassword"]').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /^Setujui$/i }).click();
}

async function expectBudgetModal(
  page: import('@playwright/test').Page,
  { projectKode, accountKode }: { projectKode: string; accountKode: string },
) {
  await expect(
    page.getByRole('heading', { name: /Override Budget Terlampaui/i }),
  ).toBeVisible({ timeout: 15_000 });
  const modal = page.locator('div:has(> h3:has-text("Override Budget Terlampaui"))').first();
  await expect(modal).toContainText(projectKode);
  await expect(modal).toContainText(accountKode);
}

// ---------------------------------------------------------------
// TEST 1 — JURNAL detail page
// ---------------------------------------------------------------

test('Jurnal detail: post terkena budget → override → POSTED', async ({ page, context }) => {
  const c = await apiLogin();
  const { projectId, projectKode } = await seedProjectBudget(c, ACCOUNT_ID_6104, '100000');

  const jurnalRes = await c.ctx.post('/api/v1/journals', {
    headers: c.auth,
    data: {
      cabangId: CABANG_SMG,
      tanggal: todayISO(),
      deskripsi: `Audit jurnal ${projectKode}`,
      sumber: 'MANUAL',
      lines: [
        { accountId: ACCOUNT_ID_6104, projectId, debit: '500000', kredit: '0' },
        { accountId: ACCOUNT_ID_KAS, debit: '0', kredit: '500000' },
      ],
    },
  });
  expect(jurnalRes.ok(), `Create draft jurnal failed: ${await jurnalRes.text()}`).toBeTruthy();
  const jurnal = await jurnalRes.json();

  await uiLoginAsOwner(page, context, c.tenantId);
  await page.goto(`/pembukuan/jurnal/${jurnal.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Post Jurnal$/i }).click();
  await expectBudgetModal(page, { projectKode, accountKode: '6-104' });
  await fillModalAndSubmit(page, 'Audit jurnal — pengecualian direksi');
  await expect(page.getByRole('heading', { name: /JU-\d{4}-\d{2}-\d{4}/ })).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------
// TEST 2 — SALES INVOICE detail page
// ---------------------------------------------------------------

test('Sales detail: post terkena budget → override → POSTED', async ({ page, context }) => {
  const c = await apiLogin();
  // Budget di akun 4-101 Penjualan (kredit-normal). Faktur ini kredit 800.000
  // ke pendapatan, budget 100.000 → over budget.
  const { projectId, projectKode } = await seedProjectBudget(c, ACCOUNT_ID_PENJUALAN, '100000');

  const invRes = await c.ctx.post('/api/v1/sales-invoices', {
    headers: c.auth,
    data: {
      cabangId: CABANG_SMG,
      customerId: CUSTOMER_ID,
      tanggal: todayISO(),
      termin: 'KREDIT',
      akunArId: ACCOUNT_ID_AR,
      lines: [
        {
          deskripsi: `Jasa konsultan audit ${projectKode}`,
          qty: '1',
          satuan: 'Ls',
          hargaSatuan: '800000',
          klasifikasiPpn: 'NON_BKP',
          isJasa: true,
          akunPendapatanId: ACCOUNT_ID_PENJUALAN,
          projectId,
        },
      ],
    },
  });
  expect(invRes.ok(), `Create draft sales failed: ${await invRes.text()}`).toBeTruthy();
  const inv = await invRes.json();

  await uiLoginAsOwner(page, context, c.tenantId);
  await page.goto(`/transaksi/penjualan/${inv.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Post Faktur/i }).click();
  await expectBudgetModal(page, { projectKode, accountKode: '4-101' });
  await fillModalAndSubmit(page, 'Audit sales — kampanye musim tinggi');
  await expect(page.getByRole('heading', { name: /INV-\d{4}-\d{2}-\d{4}/ })).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------
// TEST 3 — PURCHASE INVOICE detail page
// ---------------------------------------------------------------

test('Purchase detail: post terkena budget → override → POSTED', async ({ page, context }) => {
  const c = await apiLogin();
  const { projectId, projectKode } = await seedProjectBudget(c, ACCOUNT_ID_6104, '100000');

  const invRes = await c.ctx.post('/api/v1/purchase-invoices', {
    headers: c.auth,
    data: {
      cabangId: CABANG_SMG,
      vendorId: VENDOR_ID,
      tanggal: todayISO(),
      termin: 'KREDIT',
      akunApId: ACCOUNT_ID_AP,
      potongPph23: false,
      lines: [
        {
          deskripsi: `Beban iklan digital ${projectKode}`,
          qty: '1',
          satuan: 'Ls',
          hargaSatuan: '600000',
          klasifikasiPpn: 'NON_BKP',
          isJasa: true,
          akunDebitId: ACCOUNT_ID_6104,
          projectId,
        },
      ],
    },
  });
  expect(invRes.ok(), `Create draft purchase failed: ${await invRes.text()}`).toBeTruthy();
  const inv = await invRes.json();

  await uiLoginAsOwner(page, context, c.tenantId);
  await page.goto(`/transaksi/pembelian/${inv.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Post Tagihan$/i }).click();
  await expectBudgetModal(page, { projectKode, accountKode: '6-104' });
  await fillModalAndSubmit(page, 'Audit purchase — pengecualian anggaran iklan');
  await expect(page.getByRole('heading', { name: /BILL-\d{4}-\d{2}-\d{4}/ })).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------
// TEST 4 — CASH/BANK detail page
// ---------------------------------------------------------------

test('CashBank detail: post PAYMENT terkena budget → override → POSTED', async ({ page, context }) => {
  const c = await apiLogin();
  const { projectId, projectKode } = await seedProjectBudget(c, ACCOUNT_ID_6104, '100000');

  const entryRes = await c.ctx.post('/api/v1/cash-bank', {
    headers: c.auth,
    data: {
      cabangId: CABANG_SMG,
      tipe: 'PAYMENT',
      tanggal: todayISO(),
      akunKasBankId: ACCOUNT_ID_KAS,
      total: '400000',
      kontak: 'Vendor iklan',
      lines: [
        {
          accountId: ACCOUNT_ID_6104,
          nilai: '400000',
          projectId,
          deskripsi: 'Beban iklan audit',
        },
      ],
    },
  });
  expect(entryRes.ok(), `Create draft cash-bank failed: ${await entryRes.text()}`).toBeTruthy();
  const entry = await entryRes.json();

  await uiLoginAsOwner(page, context, c.tenantId);
  await page.goto(`/transaksi/kas-bank/${entry.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Post Bukti$/i }).click();
  await expectBudgetModal(page, { projectKode, accountKode: '6-104' });
  await fillModalAndSubmit(page, 'Audit cashbank — override anggaran iklan');
  // Nomor BKK utk PAYMENT
  await expect(page.getByRole('heading', { name: /BKK-\d{4}-\d{2}-\d{4}/ })).toBeVisible({ timeout: 15_000 });
});
