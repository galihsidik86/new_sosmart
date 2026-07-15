import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreateJenisPelangganInput {
  nama: string;
  urutan?: number;
}

export interface UpdateJenisPelangganInput {
  nama?: string;
  aktif?: boolean;
  urutan?: number;
}

@Injectable()
export class JenisPelangganService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(includeInactive = false) {
    return this.tenancy.run((tx) =>
      tx.jenisPelanggan.findMany({
        where: includeInactive ? {} : { aktif: true },
        orderBy: [{ aktif: 'desc' }, { urutan: 'asc' }, { nama: 'asc' }],
        include: { _count: { select: { customers: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const t = await tx.jenisPelanggan.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Jenis pelanggan tidak ditemukan');
      return t;
    });
  }

  create(input: CreateJenisPelangganInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      try {
        return await tx.jenisPelanggan.create({
          data: { tenantId, nama: input.nama.trim(), urutan: input.urutan ?? 0 },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Jenis "${input.nama}" sudah ada`);
        }
        throw e;
      }
    });
  }

  update(id: string, input: UpdateJenisPelangganInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.jenisPelanggan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Jenis pelanggan tidak ditemukan');
      const data: Prisma.JenisPelangganUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.aktif !== undefined) data.aktif = input.aktif;
      if (input.urutan !== undefined) data.urutan = input.urutan;
      try {
        return await tx.jenisPelanggan.update({ where: { id }, data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Jenis "${input.nama}" sudah ada`);
        }
        throw e;
      }
    });
  }

  async delete(id: string) {
    return this.tenancy.run(async (tx) => {
      const used = await tx.customer.count({ where: { jenisPelangganId: id } });
      if (used > 0) {
        throw new BadRequestException(
          `Jenis dipakai oleh ${used} pelanggan — set nonaktif saja supaya data lama tetap utuh`,
        );
      }
      await tx.jenisPelanggan.delete({ where: { id } });
      return { removed: true };
    });
  }
}
