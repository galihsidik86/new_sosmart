import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  CostMethod,
  Prisma,
  StokMovementType,
} from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';

export interface RecordInboundParams {
  itemId: string;
  cabangId: string;
  tanggal: Date;
  qty: Decimal;
  hargaPokok: Decimal;            // wajib
  tipe: StokMovementType;          // STOK_AWAL/PEMBELIAN/RETUR_JUAL/OPNAME_PLUS
  sumberType?: string;
  sumberId?: string;
  keterangan?: string;
}

export interface RecordOutboundParams {
  itemId: string;
  cabangId: string;
  tanggal: Date;
  qty: Decimal;
  tipe: StokMovementType;          // PENJUALAN/RETUR_BELI/OPNAME_MINUS
  sumberType?: string;
  sumberId?: string;
  keterangan?: string;
  /// Kalau true, izinkan stok jadi negatif (untuk reversal stok awal demo). Default false.
  allowNegative?: boolean;
}

export interface OutboundResult {
  movementId: string;
  hpp: Decimal;                    // total cost of goods sold untuk qty ini
  hargaPokokRata: Decimal;         // avg unit cost
}

/**
 * Engine inventory dengan dukungan FIFO dan AVERAGE (moving average).
 * Konvensi:
 *   * Semua method menerima `tx: Prisma.TransactionClient` — caller harus
 *     sudah bungkus di transaksi (mis. dari sales/purchase/adjustment service).
 *   * `lockItem` pakai Postgres advisory lock per (tenant, item, cabang)
 *     supaya tidak ada race condition saat dua transaksi sales jalan barengan.
 *   * Movement.saldoQty / saldoNilai adalah snapshot SETELAH movement —
 *     query saldo terkini = ambil movement terakhir (atau 0 kalau belum ada).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  async exportSaldoXlsx(opts: { cabangId?: string }): Promise<Buffer> {
    const rows = await this.saldoMatrix(opts);
    return this.excel.buildBuffer(
      'Saldo Stok',
      [
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang?.kode ?? '' },
        { header: 'Kode', key: 'kode', width: 14, value: (r) => r.item?.kode ?? '' },
        { header: 'Nama', key: 'nama', width: 32, value: (r) => r.item?.nama ?? '' },
        { header: 'Satuan', key: 'satuan', width: 10, value: (r) => r.item?.satuan ?? '' },
        { header: 'Saldo Qty', key: 'qty', width: 14, format: 'number', value: (r) => r.qty },
        { header: 'Saldo Nilai', key: 'nilai', width: 18, format: 'currency', value: (r) => r.nilai },
        { header: 'Update Terakhir', key: 'last', width: 16, format: 'date', value: (r) => r.lastAt },
      ],
      rows,
    );
  }

  async exportKartuStokXlsx(opts: {
    itemId: string; cabangId?: string; startDate?: Date; endDate?: Date;
  }): Promise<Buffer> {
    const { item, rows } = await this.kartuStok(opts);
    return this.excel.buildBuffer(
      `Kartu Stok ${item.kode}`,
      [
        { header: 'Tanggal', key: 'tanggal', width: 12, format: 'date', value: (r) => r.tanggal },
        { header: 'Cabang', key: 'cabang', width: 10, value: (r) => r.cabang.kode },
        { header: 'Tipe', key: 'tipe', width: 14, value: (r) => r.tipe },
        { header: 'Qty In', key: 'in', width: 12, format: 'number', value: (r) => r.qtyIn },
        { header: 'Qty Out', key: 'out', width: 12, format: 'number', value: (r) => r.qtyOut },
        { header: 'Harga Pokok', key: 'hp', width: 14, format: 'currency', value: (r) => r.hargaPokok },
        { header: 'Nilai Movement', key: 'nilai', width: 16, format: 'currency', value: (r) => r.nilai },
        { header: 'Saldo Qty', key: 'sQty', width: 14, format: 'number', value: (r) => r.saldoQty },
        { header: 'Saldo Nilai', key: 'sNilai', width: 18, format: 'currency', value: (r) => r.saldoNilai },
        { header: 'Keterangan', key: 'ket', width: 30, value: (r) => r.keterangan ?? '' },
      ],
      rows,
    );
  }

  // ---------------------------------------------------------------
  // LOCK & SALDO
  // ---------------------------------------------------------------

  async lockItem(
    tx: Prisma.TransactionClient,
    itemId: string,
    cabangId: string,
  ): Promise<void> {
    const tenantId = this.ctx.require().tenantId;
    const key = `${tenantId}:${itemId}:${cabangId}`;
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      key,
    );
  }

  async getSaldo(
    tx: Prisma.TransactionClient,
    itemId: string,
    cabangId: string,
  ): Promise<{ qty: Decimal; nilai: Decimal }> {
    const last = await tx.stokMovement.findFirst({
      where: { itemId, cabangId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { saldoQty: true, saldoNilai: true },
    });
    return last
      ? { qty: new Decimal(last.saldoQty), nilai: new Decimal(last.saldoNilai) }
      : { qty: new Decimal(0), nilai: new Decimal(0) };
  }

  private async getCostMethod(tx: Prisma.TransactionClient): Promise<CostMethod> {
    const tenantId = this.ctx.require().tenantId;
    const t = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { costMethod: true },
    });
    return t?.costMethod ?? CostMethod.AVERAGE;
  }

  // ---------------------------------------------------------------
  // INBOUND
  // ---------------------------------------------------------------

  async recordInbound(
    tx: Prisma.TransactionClient,
    p: RecordInboundParams,
  ): Promise<string> {
    const tenantId = this.ctx.require().tenantId;
    if (p.qty.lte(0)) throw new BadRequestException('qty inbound harus > 0');
    if (p.hargaPokok.lt(0)) throw new BadRequestException('hargaPokok tidak boleh negatif');

    await this.lockItem(tx, p.itemId, p.cabangId);
    const prev = await this.getSaldo(tx, p.itemId, p.cabangId);

    const qtyNew = prev.qty.plus(p.qty);
    const nilaiMovement = p.qty.mul(p.hargaPokok).toDecimalPlaces(2);
    const nilaiNew = prev.nilai.plus(nilaiMovement);

    const movement = await tx.stokMovement.create({
      data: {
        tenantId,
        itemId: p.itemId,
        cabangId: p.cabangId,
        tanggal: p.tanggal,
        tipe: p.tipe,
        qtyIn: p.qty.toFixed(4),
        qtyOut: '0',
        hargaPokok: p.hargaPokok.toFixed(4),
        nilai: nilaiMovement.toFixed(2),
        saldoQty: qtyNew.toFixed(4),
        saldoNilai: nilaiNew.toFixed(2),
        sumberType: p.sumberType,
        sumberId: p.sumberId,
        keterangan: p.keterangan,
      },
    });

    // Lot tracking untuk FIFO
    const method = await this.getCostMethod(tx);
    if (method === CostMethod.FIFO) {
      await tx.stokLot.create({
        data: {
          tenantId,
          itemId: p.itemId,
          cabangId: p.cabangId,
          tanggalMasuk: p.tanggal,
          qtyMasuk: p.qty.toFixed(4),
          qtyTerpakai: '0',
          hargaPokok: p.hargaPokok.toFixed(4),
          movementMasukId: movement.id,
        },
      });
    }
    return movement.id;
  }

  // ---------------------------------------------------------------
  // OUTBOUND
  // ---------------------------------------------------------------

  async recordOutbound(
    tx: Prisma.TransactionClient,
    p: RecordOutboundParams,
  ): Promise<OutboundResult> {
    const tenantId = this.ctx.require().tenantId;
    if (p.qty.lte(0)) throw new BadRequestException('qty outbound harus > 0');

    await this.lockItem(tx, p.itemId, p.cabangId);
    const prev = await this.getSaldo(tx, p.itemId, p.cabangId);

    if (!p.allowNegative && prev.qty.lt(p.qty)) {
      const item = await tx.item.findUnique({
        where: { id: p.itemId },
        select: { kode: true, nama: true },
      });
      throw new BadRequestException(
        `Stok ${item?.kode ?? ''} (${item?.nama ?? ''}) tidak cukup: tersedia ${prev.qty.toFixed(2)}, diminta ${p.qty.toFixed(2)}`,
      );
    }

    const method = await this.getCostMethod(tx);
    let hpp = new Decimal(0);
    const konsumsi: Array<{ lotId: string; qty: Decimal; hargaPokok: Decimal }> = [];

    if (method === CostMethod.FIFO) {
      // Walk lot tertua dulu.
      const lotsRaw = await tx.stokLot.findMany({
        where: {
          itemId: p.itemId,
          cabangId: p.cabangId,
        },
        orderBy: [{ tanggalMasuk: 'asc' }, { occurredAt: 'asc' }],
      });
      // Filter lot yang masih ada sisa.
      const lots = lotsRaw.filter((l) =>
        new Decimal(l.qtyMasuk).gt(new Decimal(l.qtyTerpakai)),
      );

      let remaining = p.qty;
      for (const lot of lots) {
        if (remaining.lte(0)) break;
        const sisaLot = new Decimal(lot.qtyMasuk).minus(new Decimal(lot.qtyTerpakai));
        const ambil = Decimal.min(sisaLot, remaining);
        const cost = ambil.mul(new Decimal(lot.hargaPokok));
        hpp = hpp.plus(cost);
        konsumsi.push({
          lotId: lot.id,
          qty: ambil,
          hargaPokok: new Decimal(lot.hargaPokok),
        });
        await tx.stokLot.update({
          where: { id: lot.id },
          data: {
            qtyTerpakai: new Decimal(lot.qtyTerpakai).plus(ambil).toFixed(4),
          },
        });
        remaining = remaining.minus(ambil);
      }
      if (remaining.gt(0)) {
        // Tidak ada lot lagi tapi qty masih sisa (rare — terjadi kalau allowNegative dan
        // saldoQty positif dari OPNAME_PLUS yang tidak membuat lot, dll). Fallback: pakai
        // harga pokok rata saldoNilai/saldoQty kalau ada, atau 0.
        const fallbackUnit = prev.qty.gt(0)
          ? prev.nilai.div(prev.qty)
          : new Decimal(0);
        hpp = hpp.plus(remaining.mul(fallbackUnit));
      }
    } else {
      // AVERAGE: pakai saldo rata-rata sebelum outbound.
      const avgCost = prev.qty.gt(0)
        ? prev.nilai.div(prev.qty)
        : new Decimal(0);
      hpp = p.qty.mul(avgCost).toDecimalPlaces(2);
    }

    hpp = hpp.toDecimalPlaces(2);
    const hargaPokokRata = p.qty.gt(0) ? hpp.div(p.qty) : new Decimal(0);
    const qtyNew = prev.qty.minus(p.qty);
    const nilaiNew = prev.nilai.minus(hpp);

    const movement = await tx.stokMovement.create({
      data: {
        tenantId,
        itemId: p.itemId,
        cabangId: p.cabangId,
        tanggal: p.tanggal,
        tipe: p.tipe,
        qtyIn: '0',
        qtyOut: p.qty.toFixed(4),
        hargaPokok: hargaPokokRata.toFixed(4),
        nilai: hpp.negated().toFixed(2),
        saldoQty: qtyNew.toFixed(4),
        saldoNilai: nilaiNew.toFixed(2),
        sumberType: p.sumberType,
        sumberId: p.sumberId,
        keterangan: p.keterangan,
      },
    });

    if (method === CostMethod.FIFO) {
      for (const k of konsumsi) {
        await tx.stokLotKonsumsi.create({
          data: {
            tenantId,
            lotId: k.lotId,
            movementOutId: movement.id,
            qty: k.qty.toFixed(4),
            hargaPokok: k.hargaPokok.toFixed(4),
          },
        });
      }
    }

    return { movementId: movement.id, hpp, hargaPokokRata };
  }

  // ---------------------------------------------------------------
  // REVERSE inbound/outbound (untuk cancel faktur)
  // ---------------------------------------------------------------

  /**
   * Reverse inbound: keluar qty yang sama dengan harga pokok yang sama.
   * Untuk FIFO, tandai lot terpakai (atau buat konsumsi kebalikannya).
   * Sederhana: kita record OUT dengan hargaPokok=hargaPokok asli (tidak walk lot).
   */
  async reverseInbound(
    tx: Prisma.TransactionClient,
    sumberType: string,
    sumberId: string,
    tanggal: Date,
  ): Promise<void> {
    const movs = await tx.stokMovement.findMany({
      where: { sumberType, sumberId },
    });
    for (const m of movs) {
      if (new Decimal(m.qtyIn).gt(0)) {
        await this.recordOutbound(tx, {
          itemId: m.itemId,
          cabangId: m.cabangId,
          tanggal,
          qty: new Decimal(m.qtyIn),
          tipe: m.tipe,
          sumberType: 'REVERSAL',
          sumberId: m.id,
          keterangan: `Pembalik ${m.tipe}`,
          allowNegative: true,
        });
      } else if (new Decimal(m.qtyOut).gt(0)) {
        await this.recordInbound(tx, {
          itemId: m.itemId,
          cabangId: m.cabangId,
          tanggal,
          qty: new Decimal(m.qtyOut),
          hargaPokok: new Decimal(m.hargaPokok),
          tipe: m.tipe,
          sumberType: 'REVERSAL',
          sumberId: m.id,
          keterangan: `Pembalik ${m.tipe}`,
        });
      }
    }
  }

  // ---------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------

  /** Saldo terkini untuk semua item (× cabang). */
  saldoMatrix(opts: { cabangId?: string }) {
    return this.tenancy.run(async (tx) => {
      // Untuk performa: ambil movement terakhir per (item, cabang) via window function.
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.cabangId) {
        where.push(`cabang_id = $${params.length + 1}::uuid`);
        params.push(opts.cabangId);
      }
      const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await tx.$queryRawUnsafe<
        Array<{
          item_id: string;
          cabang_id: string;
          saldo_qty: string;
          saldo_nilai: string;
          last_at: Date;
        }>
      >(
        `
        SELECT DISTINCT ON (item_id, cabang_id)
          item_id, cabang_id, saldo_qty, saldo_nilai, occurred_at AS last_at
        FROM stok_movements
        ${filter}
        ORDER BY item_id, cabang_id, occurred_at DESC, created_at DESC
        `,
        ...params,
      );

      // Join manual ke item & cabang (sudah di-scope RLS).
      const items = await tx.item.findMany({
        where: { isAktif: true },
        select: { id: true, kode: true, nama: true, satuan: true, kategori: true },
      });
      const cabang = await tx.cabang.findMany({
        select: { id: true, kode: true, nama: true },
      });
      const itemMap = new Map(items.map((i) => [i.id, i]));
      const cabangMap = new Map(cabang.map((c) => [c.id, c]));

      return rows
        .map((r) => ({
          item: itemMap.get(r.item_id),
          cabang: cabangMap.get(r.cabang_id),
          qty: r.saldo_qty,
          nilai: r.saldo_nilai,
          lastAt: r.last_at,
        }))
        .filter((r) => r.item && r.cabang);
    });
  }

  /** Kartu stok per item per cabang. */
  kartuStok(opts: {
    itemId: string;
    cabangId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this.tenancy.run(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: opts.itemId } });
      if (!item) throw new NotFoundException('Item tidak ditemukan');

      const where: Prisma.StokMovementWhereInput = { itemId: opts.itemId };
      if (opts.cabangId) where.cabangId = opts.cabangId;
      if (opts.startDate || opts.endDate) {
        where.occurredAt = {};
        if (opts.startDate) where.occurredAt.gte = opts.startDate;
        if (opts.endDate) where.occurredAt.lte = opts.endDate;
      }

      const rows = await tx.stokMovement.findMany({
        where,
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        include: { cabang: { select: { kode: true } } },
      });
      return { item, rows };
    });
  }
}
