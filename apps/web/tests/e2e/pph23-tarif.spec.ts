/**
 * Audit master tarif PPh 23:
 *   1) List endpoint /pph23-tarif return >0 rows (seeded).
 *   2) Buat item jasa via API dengan pph23TarifId → response include pph23Tarif detail.
 *   3) List /items include pph23Tarif untuk item tersebut.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const OWNER_EMAIL = 'owner@lentera.id';
const OWNER_PASSWORD = 'lentera123';

test('Pph23Tarif — seed + item integration', async () => {
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

  // 1. List tarif seeded
  const listRes = await ctx.get('/api/v1/pph23-tarif', { headers: authHeaders });
  expect(listRes.ok(), await listRes.text()).toBeTruthy();
  const tarifList = await listRes.json();
  expect(Array.isArray(tarifList)).toBeTruthy();
  expect(tarifList.length).toBeGreaterThanOrEqual(10); // seeded ~23 tarif

  // Cari tarif JASA-KONSULTAN (2%) seed
  const konsultan = tarifList.find((t: { kode: string }) => t.kode === 'JASA-KONSULTAN');
  expect(konsultan, 'JASA-KONSULTAN harus ada di seed').toBeTruthy();
  expect(Number(konsultan.tarif)).toBe(2);

  // 2. Create item jasa dengan pph23TarifId
  const kodeItem = `AUDIT-JASA-${Date.now().toString().slice(-6)}`;
  const createItem = await ctx.post('/api/v1/items', {
    headers: authHeaders,
    data: {
      kode: kodeItem,
      nama: 'Audit — jasa konsultan',
      satuan: 'Ls',
      hargaJualDefault: '1000000',
      klasifikasiPpn: 'JKP',
      isJasa: true,
      pph23TarifId: konsultan.id,
    },
  });
  expect(createItem.ok(), await createItem.text()).toBeTruthy();
  const created = await createItem.json();
  expect(created.pph23TarifId).toBe(konsultan.id);

  // 3. Fetch item byId → pph23Tarif populated
  const byId = await ctx.get(`/api/v1/items/${created.id}`, { headers: authHeaders });
  expect(byId.ok(), await byId.text()).toBeTruthy();
  const item = await byId.json();
  expect(item.pph23Tarif?.kode).toBe('JASA-KONSULTAN');
  expect(Number(item.pph23Tarif?.tarif)).toBe(2);
});
