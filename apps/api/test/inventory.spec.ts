/**
 * Integration tests untuk InventoryService — FIFO & AVERAGE invariants.
 *
 * Cakupan:
 *   - FIFO: outbound walk lot tertua dulu, HPP = sum lot price × qty per lot
 *   - FIFO partial: outbound spanning 2 lot menghasilkan 2 StokLotKonsumsi
 *   - AVERAGE: HPP = saldoNilai/saldoQty SEBELUM outbound
 *   - StokMovement.saldoQty/saldoNilai = snapshot setelah movement
 *   - Stok tidak cukup → BadRequestException (default tidak allowNegative)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';
import { TenancyService } from '../src/common/tenancy/tenancy.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import {
  bootAppWithSales,
  createTestItem,
  createTestTenant,
  resetDb,
  seedOpeningStock,
  setCostMethod,
  superPrisma,
  withTenant,
} from './helpers.js';
import { CostMethod, StokMovementType } from '@lentera/db';

describe('Inventory FIFO/Average — integration', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let ctx: TenantContext;
  let tenancy: TenancyService;
  let inventory: InventoryService;
  let t: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await bootAppWithSales();
    prisma = app.get(PrismaService);
    ctx = app.get(TenantContext);
    tenancy = app.get(TenancyService);
    inventory = app.get(InventoryService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    t = await createTestTenant(prisma);
  });

  const tenantCtx = () => ({
    tenantId: t.tenantId,
    userId: t.userId,
    role: 'OWNER',
    cabangIds: null,
  });

  describe('FIFO', () => {
    beforeEach(async () => {
      await setCostMethod(t.tenantId, CostMethod.FIFO);
    });

    it('outbound walk lot tertua dulu, HPP = lot price', async () => {
      const item = await createTestItem(t.tenantId, t.akun);

      // Inbound 2 lot: 10 unit @ 1000 (lot tertua), 10 unit @ 1500
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1500',
        tanggal: new Date(Date.UTC(2026, 3, 29)),
      });

      // Outbound 5 → harus pakai lot 1000
      const out = await withTenant(ctx, tenantCtx(), () =>
        tenancy.run((tx) =>
          inventory.recordOutbound(tx, {
            itemId: item.id,
            cabangId: t.cabangId,
            tanggal: new Date(Date.UTC(2026, 4, 5)),
            qty: new Decimal('5'),
            tipe: StokMovementType.PENJUALAN,
          }),
        ),
      );
      expect(out.hpp.toString()).toBe('5000');             // 5 × 1000
      expect(out.hargaPokokRata.toString()).toBe('1000');

      // Verifikasi konsumsi: 1 lot terpakai
      const konsumsi = await superPrisma.stokLotKonsumsi.findMany({
        where: { movementOutId: out.movementId },
      });
      expect(konsumsi).toHaveLength(1);
      expect(konsumsi[0]!.qty.toString()).toBe('5');
      expect(konsumsi[0]!.hargaPokok.toString()).toBe('1000');
    });

    it('outbound spanning 2 lot → 2 StokLotKonsumsi, HPP gabungan', async () => {
      const item = await createTestItem(t.tenantId, t.akun);
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1500',
        tanggal: new Date(Date.UTC(2026, 3, 29)),
      });

      // Outbound 15 → 10 dari lot 1000 + 5 dari lot 1500
      const out = await withTenant(ctx, tenantCtx(), () =>
        tenancy.run((tx) =>
          inventory.recordOutbound(tx, {
            itemId: item.id,
            cabangId: t.cabangId,
            tanggal: new Date(Date.UTC(2026, 4, 5)),
            qty: new Decimal('15'),
            tipe: StokMovementType.PENJUALAN,
          }),
        ),
      );
      // HPP = (10 × 1000) + (5 × 1500) = 10000 + 7500 = 17500
      expect(out.hpp.toString()).toBe('17500');

      const konsumsi = await superPrisma.stokLotKonsumsi.findMany({
        where: { movementOutId: out.movementId },
        orderBy: { hargaPokok: 'asc' },
      });
      expect(konsumsi).toHaveLength(2);
      expect(konsumsi[0]!.qty.toString()).toBe('10');
      expect(konsumsi[0]!.hargaPokok.toString()).toBe('1000');
      expect(konsumsi[1]!.qty.toString()).toBe('5');
      expect(konsumsi[1]!.hargaPokok.toString()).toBe('1500');
    });

    it('StokMovement saldoQty/saldoNilai = snapshot setelah movement', async () => {
      const item = await createTestItem(t.tenantId, t.akun);
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1500',
        tanggal: new Date(Date.UTC(2026, 3, 29)),
      });
      await withTenant(ctx, tenantCtx(), () =>
        tenancy.run((tx) =>
          inventory.recordOutbound(tx, {
            itemId: item.id, cabangId: t.cabangId, tanggal: new Date(Date.UTC(2026, 4, 5)),
            qty: new Decimal('5'), tipe: StokMovementType.PENJUALAN,
          }),
        ),
      );

      const movs = await superPrisma.stokMovement.findMany({
        where: { itemId: item.id, cabangId: t.cabangId },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      });
      expect(movs).toHaveLength(3);
      // setelah inbound 10@1000: saldo 10/10000
      expect(movs[0]!.saldoQty.toString()).toBe('10');
      expect(movs[0]!.saldoNilai.toString()).toBe('10000');
      // setelah inbound 10@1500: saldo 20/25000
      expect(movs[1]!.saldoQty.toString()).toBe('20');
      expect(movs[1]!.saldoNilai.toString()).toBe('25000');
      // setelah outbound 5 (FIFO @1000): saldo 15/20000
      expect(movs[2]!.saldoQty.toString()).toBe('15');
      expect(movs[2]!.saldoNilai.toString()).toBe('20000');
    });
  });

  describe('AVERAGE', () => {
    beforeEach(async () => {
      await setCostMethod(t.tenantId, CostMethod.AVERAGE);
    });

    it('HPP outbound = saldoNilai/saldoQty SEBELUM outbound (moving average)', async () => {
      const item = await createTestItem(t.tenantId, t.akun);
      // Inbound 10@1000, 10@1500 → saldo 20/25000 → avg 1250
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1500',
        tanggal: new Date(Date.UTC(2026, 3, 29)),
      });

      const out = await withTenant(ctx, tenantCtx(), () =>
        tenancy.run((tx) =>
          inventory.recordOutbound(tx, {
            itemId: item.id, cabangId: t.cabangId, tanggal: new Date(Date.UTC(2026, 4, 5)),
            qty: new Decimal('8'), tipe: StokMovementType.PENJUALAN,
          }),
        ),
      );
      // 8 × 1250 = 10000
      expect(out.hpp.toString()).toBe('10000');
      expect(out.hargaPokokRata.toString()).toBe('1250');
    });

    it('AVERAGE TIDAK bikin StokLot (lot tracking khusus FIFO)', async () => {
      const item = await createTestItem(t.tenantId, t.akun);
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '10', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      const lots = await superPrisma.stokLot.findMany({ where: { itemId: item.id } });
      expect(lots).toHaveLength(0);
    });
  });

  describe('Stok tidak cukup', () => {
    it('outbound > saldo → BadRequestException dengan kode item', async () => {
      await setCostMethod(t.tenantId, CostMethod.FIFO);
      const item = await createTestItem(t.tenantId, t.akun, { kode: 'BRG-CHK', nama: 'Barang Cek' });
      await seedOpeningStock(ctx, inventory, tenancy, tenantCtx(), {
        itemId: item.id, cabangId: t.cabangId, qty: '5', hargaPokok: '1000',
        tanggal: new Date(Date.UTC(2026, 3, 28)),
      });
      await expect(
        withTenant(ctx, tenantCtx(), () =>
          tenancy.run((tx) =>
            inventory.recordOutbound(tx, {
              itemId: item.id, cabangId: t.cabangId, tanggal: new Date(Date.UTC(2026, 4, 5)),
              qty: new Decimal('10'), tipe: StokMovementType.PENJUALAN,
            }),
          ),
        ),
      ).rejects.toThrow(/tidak cukup/i);
    });
  });
});
