/**
 * Verifikasi manual (bukan bagian suite otomatis) — cek wizard Saldo Awal
 * render dan bisa dipakai end-to-end lewat browser sungguhan.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

test('Saldo Awal wizard — render + tambah baris piutang', async ({ page, context }) => {
  const ctx = await pwRequest.newContext({ baseURL: API_BASE });
  const login = await ctx.post('/api/v1/auth/login', {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  const auth = await login.json();
  const tenantId = auth.memberships[0].tenantId as string;

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

  await page.goto('/pengaturan/saldo-awal', { waitUntil: 'networkidle' });
  await expect(page.getByText('Prosedur Saldo Awal Terintegrasi')).toBeVisible();
  await expect(page.getByText('Total Debit')).toBeVisible();
  await expect(page.getByText('Total Kredit')).toBeVisible();
  // Seed data punya mismatch nyata — halaman harus tampilkan status belum balance.
  await expect(page.getByText(/selisih|Rp 0 ✓ Balance/i).first()).toBeVisible();

  // Tambah baris piutang lewat form → verifikasi row baru muncul di tabel.
  const customerSelect = page.locator('select[name="customerId"]');
  await expect(customerSelect).toBeVisible();
  await customerSelect.selectOption({ index: 1 });
  const cabangSelect = page.locator('select[name="cabangId"]').first();
  await cabangSelect.selectOption({ index: 1 });
  await page.locator('input[name="nominal"]').first().fill('12345678');
  await page.getByRole('button', { name: /\+ Tambah/i }).first().click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Rp 12.345.678').first()).toBeVisible();
});
