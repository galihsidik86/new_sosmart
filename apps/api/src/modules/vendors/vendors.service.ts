import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import type { CreateVendorInput } from '@lentera/shared/schemas';

@Injectable()
export class VendorsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

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
