import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import type { ImportResult } from '../../common/http/multipart.js';
import type { CreateVendorInput } from '@lentera/shared/schemas';

@Injectable()
export class VendorsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  async importXlsx(buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.ctx.require().tenantId;
    const rows = await this.excel.parseBuffer(buffer, ['Kode', 'Nama']);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    return this.tenancy.run(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const xlsRow = i + 2;
        const kode = String(row['Kode'] ?? '').trim();
        const nama = String(row['Nama'] ?? '').trim();
        if (!kode || !nama) {
          result.errors.push({ row: xlsRow, message: 'Kode & Nama wajib diisi' });
          result.skipped++;
          continue;
        }
        try {
          await tx.vendor.create({
            data: {
              tenantId,
              kode, nama,
              npwp: String(row['NPWP'] ?? '').replace(/\D/g, '') || null,
              isPkp: ['ya', 'y', 'true', '1'].includes(String(row['PKP'] ?? '').toLowerCase().trim()),
              kategori: String(row['Kategori'] ?? '').trim() || null,
              kota: String(row['Kota'] ?? '').trim() || null,
              telp: String(row['Telp'] ?? '').trim() || null,
              terminHari: Number(row['Termin (hari)'] ?? row['Termin'] ?? 30),
            },
          });
          result.created++;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            result.errors.push({ row: xlsRow, message: `Kode "${kode}" sudah ada` });
          } else {
            result.errors.push({ row: xlsRow, message: e instanceof Error ? e.message : String(e) });
          }
          result.skipped++;
        }
      }
      return result;
    });
  }

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.list({ onlyActive: false });
    return this.excel.buildBuffer(
      'Vendor',
      [
        { header: 'Kode', key: 'kode', width: 14, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 36, value: (r) => r.nama },
        { header: 'NPWP', key: 'npwp', width: 20, value: (r) => r.npwp ?? '' },
        { header: 'PKP', key: 'isPkp', width: 8, value: (r) => (r.isPkp ? 'Ya' : '') },
        { header: 'Kategori', key: 'kategori', width: 16, value: (r) => r.kategori ?? '' },
        { header: 'Kota', key: 'kota', width: 16, value: (r) => r.kota ?? '' },
        { header: 'Telp', key: 'telp', width: 16, value: (r) => r.telp ?? '' },
        { header: 'Termin (hari)', key: 'terminHari', width: 12, format: 'number',
          value: (r) => r.terminHari },
        { header: 'Aktif', key: 'isAktif', width: 8, value: (r) => (r.isAktif ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }

  list(opts: { search?: string; onlyActive?: boolean; onlyPkp?: boolean }) {
    const where: Prisma.VendorWhereInput = {};
    if (opts.onlyActive ?? true) where.isAktif = true;
    if (opts.onlyPkp) where.isPkp = true;
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
        { npwp: { contains: opts.search } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.vendor.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: {
          akunUtang: { select: { id: true, kode: true, nama: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const v = await tx.vendor.findUnique({
        where: { id },
        include: { akunUtang: true },
      });
      if (!v) throw new NotFoundException('Vendor tidak ditemukan');
      return v;
    });
  }

  async create(input: CreateVendorInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.vendor.create({
          data: { tenantId, ...input },
        }),
      )
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Kode vendor sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateVendorInput>) {
    return this.tenancy.run((tx) =>
      tx.vendor.update({ where: { id }, data: patch }),
    );
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.vendor.update({ where: { id }, data: { isAktif: false } }),
    );
  }
}
