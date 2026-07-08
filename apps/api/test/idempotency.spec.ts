/**
 * Integration test untuk idempotency key SalesService/PurchasesService.createDraft
 * (R3, EVALUASI.md). Client generate UUID SEKALI per form mount — kalau request
 * dikirim ulang (double-submit tombol/retry jaringan) dengan key yang sama,
 * harus dapat balik faktur YANG SAMA (bukan bikin baru), baik lewat jalur
 * check-before-create normal maupun race (2 request nyaris bersamaan → unique
 * constraint DB jadi backstop terakhir, lihat catatan di service).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { KlasifikasiPpn } from '@lentera/db';
import type {
  CreatePurchaseInvoiceInput,
  CreateSalesInvoiceInput,
} from '@lentera/shared/schemas';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { SalesModule } from '../src/modules/sales/sales.module.js';
import { SalesService } from '../src/modules/sales/sales.service.js';
import { PurchasesModule } from '../src/modules/purchases/purchases.module.js';
import { PurchasesService } from '../src/modules/purchases/purchases.service.js';
import { InventoryModule } from '../src/modules/inventory/inventory.module.js';
import { BuktiPotongModule } from '../src/modules/bukti-potong/bukti-potong.module.js';
import {
  bootApp,
  createTestCustomer,
  createTestItem,
  createTestTenant,
  resetDb,
  superPrisma,
  withTenant,
} from './helpers.js';

describe('Idempotency key — Sales/Purchases createDraft (integration)', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let sales: SalesService;
  let purchases: PurchasesService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;
  let customerId: string;
  let vendorId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await bootApp([SalesModule, PurchasesModule, InventoryModule, BuktiPotongModule]);
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    sales = app.get(SalesService);
    purchases = app.get(PurchasesService);
  });

  afterAll(async () => {
    await app.close();
  });

  function withOwner<T>(fn: () => Promise<T>): Promise<T> {
    return withTenant(ctx, { tenantId: t.tenantId, userId: t.userId, role: 'OWNER', cabangIds: null }, fn);
  }

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
    const cust = await createTestCustomer(t.tenantId, t.akun.piutang);
    customerId = cust.id;
    const vendor = await superPrisma.vendor.create({
      data: {
        tenantId: t.tenantId, kode: 'VEND-IDP', nama: 'Vendor Idempotency',
        isPkp: true, terminHari: 30, akunUtangId: t.akun.utangUsaha,
      },
    });
    vendorId = vendor.id;
    const item = await createTestItem(t.tenantId, t.akun, { kode: 'BRG-IDP' });
    itemId = item.id;
  });

  function salesInput(key?: string): CreateSalesInvoiceInput {
    return {
      cabangId: t.cabangId, customerId, tanggal: '2026-05-10',
      termin: 'KREDIT', akunArId: t.akun.piutang, tarifPpnPersen: 11,
      hargaTermasukPajak: false,
      idempotencyKey: key,
      lines: [{
        itemId, deskripsi: 'Barang', qty: '5', satuan: 'Pcs',
        hargaSatuan: '10000', diskonPersen: '0',
        klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
        akunPendapatanId: t.akun.pendapatan,
      }],
    };
  }

  function purchaseInput(key?: string): CreatePurchaseInvoiceInput {
    return {
      cabangId: t.cabangId, vendorId, tanggal: '2026-05-10',
      termin: 'KREDIT', akunApId: t.akun.utangUsaha, tarifPpnPersen: 11,
      tarifPph23Persen: 2, potongPph23: true, hargaTermasukPajak: false,
      idempotencyKey: key,
      lines: [{
        itemId, deskripsi: 'Barang', qty: '5', satuan: 'Pcs',
        hargaSatuan: '10000', diskonPersen: '0',
        klasifikasiPpn: KlasifikasiPpn.BKP, isJasa: false,
        akunDebitId: t.akun.persediaan,
      }],
    };
  }

  it('SalesService.createDraft — 2x call idempotencyKey sama → row sama, cuma 1 di DB', async () => {
    const key = randomUUID();
    const first = await withOwner(() => sales.createDraft(salesInput(key)));
    const second = await withOwner(() => sales.createDraft(salesInput(key)));
    expect(second.id).toBe(first.id);

    const rows = await superPrisma.salesInvoice.findMany({
      where: { tenantId: t.tenantId, idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });

  it('SalesService.createDraft — 2 request nyaris bersamaan idempotencyKey sama (race) → tetap cuma 1 row', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      withOwner(() => sales.createDraft(salesInput(key))),
      withOwner(() => sales.createDraft(salesInput(key))),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await superPrisma.salesInvoice.findMany({
      where: { tenantId: t.tenantId, idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });

  it('SalesService.createDraft — tanpa idempotencyKey, 2x call tetap bikin 2 faktur berbeda (perilaku lama tidak berubah)', async () => {
    const a = await withOwner(() => sales.createDraft(salesInput()));
    const b = await withOwner(() => sales.createDraft(salesInput()));
    expect(a.id).not.toBe(b.id);
  });

  it('PurchasesService.createDraft — 2x call idempotencyKey sama → row sama, cuma 1 di DB', async () => {
    const key = randomUUID();
    const first = await withOwner(() => purchases.createDraft(purchaseInput(key)));
    const second = await withOwner(() => purchases.createDraft(purchaseInput(key)));
    expect(second.id).toBe(first.id);

    const rows = await superPrisma.purchaseInvoice.findMany({
      where: { tenantId: t.tenantId, idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });

  it('PurchasesService.createDraft — 2 request nyaris bersamaan idempotencyKey sama (race) → tetap cuma 1 row', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      withOwner(() => purchases.createDraft(purchaseInput(key))),
      withOwner(() => purchases.createDraft(purchaseInput(key))),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await superPrisma.purchaseInvoice.findMany({
      where: { tenantId: t.tenantId, idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });
});
