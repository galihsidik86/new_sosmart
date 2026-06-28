import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import type { CreateCabangInput } from '@lentera/shared/schemas';

@Injectable()
export class CabangService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.list();
    return this.excel.buildBuffer(
      'Cabang',
      [
        { header: 'Kode', key: 'kode', width: 12, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 28, value: (r) => r.nama },
        { header: 'Pusat', key: 'pusat', width: 8, value: (r) => (r.isPusat ? 'Ya' : '') },
        { header: 'Kode NPWP Cabang', key: 'kodeNpwp', width: 14, value: (r) => r.kodeCabangNpwp ?? '' },
        { header: 'NPWP Cabang', key: 'npwp', width: 22, value: (r) => r.npwpCabang ?? '' },
        { header: 'Alamat', key: 'alamat', width: 40, value: (r) => r.alamat ?? '' },
        { header: 'Aktif', key: 'aktif', width: 8, value: (r) => (r.isActive ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }

  list() {
    return this.tenancy.run((tx) =>
      tx.cabang.findMany({
        orderBy: [{ isPusat: 'desc' }, { kode: 'asc' }],
      }),
    );
  }

  async create(input: CreateCabangInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.cabang.create({
          data: {
            tenantId,
            kode: input.kode,
            nama: input.nama,
            npwpCabang: input.npwpCabang,
            alamat: input.alamat,
            isPusat: input.isPusat,
          },
        }),
      )
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Kode cabang sudah dipakai');
        }
        throw e;
      });
  }
}
