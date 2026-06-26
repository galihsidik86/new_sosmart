import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import type { CreateKaryawanInput } from '@lentera/shared/schemas';

@Injectable()
export class KaryawanService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.list({ isActive: false });
    return this.excel.buildBuffer(
      'Karyawan',
      [
        { header: 'Kode', key: 'kode', width: 12, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 28, value: (r) => r.nama },
        { header: 'NIK', key: 'nik', width: 20, value: (r) => r.nik },
        { header: 'NPWP', key: 'npwp', width: 20, value: (r) => r.npwp ?? '' },
        { header: 'Jabatan', key: 'jabatan', width: 18, value: (r) => r.jabatan ?? '' },
        { header: 'PTKP', key: 'ptkp', width: 8, value: (r) => r.ptkpStatus },
        { header: 'Jenis', key: 'jenis', width: 18, value: (r) => r.jenisKaryawan },
        { header: 'Cabang', key: 'cabang', width: 12, value: (r) => r.cabang?.kode ?? '' },
        { header: 'Gaji Pokok', key: 'gajiPokok', width: 14, format: 'currency', value: (r) => r.gajiPokok },
        { header: 'Tunjangan', key: 'tunjangan', width: 14, format: 'currency', value: (r) => r.tunjanganTetap },
        { header: 'BPJS Karyawan', key: 'bpjs', width: 14, format: 'currency', value: (r) => r.iuranBpjsKaryawan },
        { header: 'Aktif', key: 'aktif', width: 8, value: (r) => (r.isActive ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }

  list(opts: { isActive?: boolean; cabangId?: string; search?: string }) {
    const where: Prisma.KaryawanWhereInput = {};
    if (opts.isActive ?? true) where.isActive = true;
    if (opts.cabangId) where.cabangId = opts.cabangId;
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
        { nik: { contains: opts.search } },
        { npwp: { contains: opts.search } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.karyawan.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: { cabang: { select: { kode: true, nama: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const k = await tx.karyawan.findUnique({
        where: { id },
        include: { cabang: true },
      });
      if (!k) throw new NotFoundException('Karyawan tidak ditemukan');
      return k;
    });
  }

  async create(input: CreateKaryawanInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.karyawan.create({
          data: {
            tenantId,
            ...input,
            tanggalMasuk: new Date(input.tanggalMasuk + 'T00:00:00Z'),
            tanggalKeluar: input.tanggalKeluar
              ? new Date(input.tanggalKeluar + 'T00:00:00Z')
              : null,
          },
        }),
      )
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Kode karyawan sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateKaryawanInput>) {
    return this.tenancy.run((tx) =>
      tx.karyawan.update({
        where: { id },
        data: {
          ...patch,
          tanggalMasuk: patch.tanggalMasuk
            ? new Date(patch.tanggalMasuk + 'T00:00:00Z')
            : undefined,
          tanggalKeluar: patch.tanggalKeluar
            ? new Date(patch.tanggalKeluar + 'T00:00:00Z')
            : undefined,
        },
      }),
    );
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.karyawan.update({ where: { id }, data: { isActive: false } }),
    );
  }
}
