/**
 * Audit menyeluruh wizard Saldo Awal Terintegrasi lewat browser sungguhan.
 * Cakupan: tambah/hapus baris (utang/persediaan/piutang), simpan akun manual,
 * tombol Post ter-disable saat belum balance, alur balance→post→void penuh,
 * dan role-gating (AUDITOR harus ditolak).
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

async function loginUi(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext, tenantId: string, role: string) {
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
      value: JSON.stringify({ tenantId, tenantNama: 'PT Sinar Niaga Sentosa', role }),
      url: 'http://localhost:3000',
    },
  ]);
}

test.describe.serial('Saldo Awal wizard — audit menyeluruh', () => {
  let tenantId: string;
  let authHeaders: Record<string, string>;

  test.beforeAll(async () => {
    const ctx = await pwRequest.newContext({ baseURL: API_BASE });
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    });
    const auth = await login.json();
    tenantId = auth.memberships[0].tenantId as string;
    authHeaders = {
      authorization: `Bearer ${auth.accessToken}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
  });

  test('render, tambah + hapus baris utang & persediaan', async ({ page, context }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(OWNER_EMAIL);
    await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/pilih-cabang|\/pembukuan|\/dashboard|\/$/),
      page.getByRole('button', { name: /masuk/i }).click(),
    ]);
    await context.addCookies([
      { name: 'lentera_tenant', value: JSON.stringify({ tenantId, tenantNama: 'PT Sinar Niaga Sentosa', role: 'OWNER' }), url: 'http://localhost:3000' },
    ]);

    await page.goto('/pengaturan/saldo-awal', { waitUntil: 'networkidle' });
    await expect(page.getByText('Prosedur Saldo Awal Terintegrasi')).toBeVisible();

    // --- Tambah Utang ---
    const utangSection = page.locator('div').filter({ hasText: '3. Utang per Vendor' }).last();
    await utangSection.locator('select[name="vendorId"]').selectOption({ index: 1 });
    await utangSection.locator('select[name="cabangId"]').selectOption({ index: 1 });
    await utangSection.locator('input[name="nominal"]').fill('7000000');
    await utangSection.getByRole('button', { name: /\+ Tambah/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Rp 7.000.000').first()).toBeVisible();

    // --- Tambah Persediaan --- (pakai cabang SBY, bukan SMG, supaya tidak
    // upsert-menimpa baris seed existing yang sudah ada di SMG+tanggal sama)
    const persSection = page.locator('div').filter({ hasText: '4. Persediaan per Barang' }).last();
    await persSection.locator('select[name="itemId"]').selectOption({ index: 0 });
    await persSection.locator('select[name="cabangId"]').selectOption({ index: 1 });
    await persSection.locator('input[name="qty"]').fill('3');
    await persSection.locator('input[name="hargaPokokPerUnit"]').fill('500000');
    await persSection.getByRole('button', { name: /\+ Tambah/i }).click();
    await page.waitForLoadState('networkidle');
    // Kolom tabel: qty & harga POKOK PER UNIT ditampilkan terpisah (bukan total).
    const newPersRow = page.getByRole('row', { name: /SBY.*3.*Rp 500\.000/ });
    await expect(newPersRow).toBeVisible();

    // --- Hapus keduanya — target baris SPESIFIK yang baru ditambah, bukan
    // cuma ".first()" (section persediaan berisi 6 baris seed lain juga). ---
    await utangSection.getByRole('row', { name: /Rp 7\.000\.000/ }).getByRole('button', { name: 'Hapus' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Rp 7.000.000')).toHaveCount(0);
    await newPersRow.getByRole('button', { name: 'Hapus' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('row', { name: /SBY.*3.*Rp 500\.000/ })).toHaveCount(0);

    // Balik ke state semula — pastikan tidak ada sisa baris nyasar.
    const previewAfter = await (await pwRequest.newContext({ baseURL: API_BASE })).get(
      '/api/v1/opening-balance/preview', { headers: authHeaders },
    );
    const p = await previewAfter.json();
    expect(p.countUtang).toBe(0);
    expect(p.countPersediaan).toBe(6); // balik ke 6 item seed awal
  });

  test('tombol Post ter-disable saat belum balance', async ({ page, context }) => {
    await loginUi(page, context, tenantId, 'OWNER');
    await page.goto('/pengaturan/saldo-awal', { waitUntil: 'networkidle' });
    const postBtn = page.getByRole('button', { name: /Posting & Kunci/i });
    await expect(postBtn).toBeVisible();
    await expect(postBtn).toBeDisabled();
    await expect(page.getByText('Selisihkan dulu Debit dan Kredit')).toBeVisible();
  });

  test('simpan akun manual (round-trip nilai tidak berubah)', async ({ page, context }) => {
    await loginUi(page, context, tenantId, 'OWNER');
    await page.goto('/pengaturan/saldo-awal', { waitUntil: 'networkidle' });
    const kasInput = page.locator('input[name="nilai[]"]').first();
    const before = await kasInput.inputValue();
    await page.getByRole('button', { name: 'Simpan Saldo Akun' }).click();
    await page.waitForLoadState('networkidle');
    const after = await page.locator('input[name="nilai[]"]').first().inputValue();
    expect(Number(after)).toBe(Number(before));
  });

  test('alur penuh: balance → Post → verifikasi POSTED → Void → verifikasi restored', async ({ page, context }) => {
    await loginUi(page, context, tenantId, 'OWNER');
    await page.goto('/pengaturan/saldo-awal', { waitUntil: 'networkidle' });

    // Selisih saat ini (dari test sebelumnya, harus balik ke baseline Rp463.540.000).
    const previewRes = await (await pwRequest.newContext({ baseURL: API_BASE })).get(
      '/api/v1/opening-balance/preview', { headers: authHeaders },
    );
    const preview = await previewRes.json();
    expect(preview.balanced).toBe(false);
    const selisih = Math.abs(Number(preview.selisih));
    expect(selisih).toBe(463_540_000);

    // Tambah piutang persis sebesar selisih supaya balance.
    const piutangSection = page.locator('div').filter({ hasText: '2. Piutang per Pelanggan' }).last();
    await piutangSection.locator('select[name="customerId"]').selectOption({ index: 1 });
    await piutangSection.locator('select[name="cabangId"]').selectOption({ index: 1 });
    await piutangSection.locator('input[name="nominal"]').fill(String(selisih));
    await piutangSection.getByRole('button', { name: /\+ Tambah/i }).click();
    await page.waitForLoadState('networkidle');

    // Widget balance harus hijau sekarang.
    await expect(page.getByText('Rp 0 ✓ Balance')).toBeVisible();
    const postBtn = page.getByRole('button', { name: /Posting & Kunci/i });
    await expect(postBtn).toBeEnabled();

    // Klik Post.
    await postBtn.click();
    await page.waitForLoadState('networkidle');

    // Setelah posting: status POSTED, form add hilang, tombol Void muncul.
    await expect(page.getByText('Status:').locator('..').getByText('POSTED')).toBeVisible();
    await expect(page.getByText('sudah diposting dan terkunci')).toBeVisible();
    await expect(page.getByRole('button', { name: /Void & Buka Kunci/i })).toBeVisible();
    // Form tambah tidak lagi tampil (isDraft=false).
    await expect(page.locator('button', { hasText: '+ Tambah' })).toHaveCount(0);

    // Verifikasi server-side: akun kliring net 0, invoice POSTED.
    const afterPostRes = await (await pwRequest.newContext({ baseURL: API_BASE })).get(
      '/api/v1/opening-balance/preview', { headers: authHeaders },
    );
    const afterPost = await afterPostRes.json();
    expect(afterPost.status).toBe('POSTED');

    // --- Void ---
    await page.locator('input[name="alasan"]').fill('Audit Playwright — koreksi balik ke DRAFT');
    await page.getByRole('button', { name: /Void & Buka Kunci/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /Posting & Kunci/i })).toBeVisible();
    const afterVoidRes = await (await pwRequest.newContext({ baseURL: API_BASE })).get(
      '/api/v1/opening-balance/preview', { headers: authHeaders },
    );
    const afterVoid = await afterVoidRes.json();
    expect(afterVoid.status).toBe('DRAFT');
    // Saldo akun manual harus balik seperti semula (selisih sama seperti sebelum piutang ditambah,
    // karena piutang tadi masih ada sebagai invoice CANCELLED, tidak dihitung preview lagi).
    expect(Math.abs(Number(afterVoid.selisih))).toBe(463_540_000);
  });

  test('role AUDITOR ditolak akses /opening-balance API', async () => {
    // AUDITOR bukan bagian @Roles('OWNER','ADMIN','AKUNTAN') di controller —
    // buat user AUDITOR sementara, pastikan API menolak (403), bukan cuma UI yang sembunyikan menu.
    const ctx = await pwRequest.newContext({ baseURL: API_BASE });
    const email = `audit-auditor-${Date.now()}@lentera.id`;
    const createRes = await ctx.post('/api/v1/users', {
      headers: authHeaders,
      data: { email, nama: 'Auditor Test', password: 'testpassword123', role: 'AUDITOR', cabangIds: [] },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const loginRes = await ctx.post('/api/v1/auth/login', { data: { email, password: 'testpassword123' } });
    const auditorAuth = await loginRes.json();
    const auditorHeaders = {
      authorization: `Bearer ${auditorAuth.accessToken}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };

    const previewRes = await ctx.get('/api/v1/opening-balance/preview', { headers: auditorHeaders });
    expect(previewRes.status()).toBe(403);
  });
});
