import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreateJenisProjekInput {
  nama: string;
  urutan?: number;
}
export interface UpdateJenisProjekInput {
  nama?: string;
  aktif?: boolean;
  urutan?: number;
}

@Injectable()
export class JenisProjekService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(includeInactive = false) {
    return this.tenancy.run((tx) =>
      tx.jenisProjek.findMany({
        where: includeInactive ? {} : { aktif: true },
        orderBy: [{ aktif: 'desc' }, { urutan: 'asc' }, { nama: 'asc' }],
        include: { _count: { select: { projects: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const t = await tx.jenisProjek.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Jenis projek tidak ditemukan');
      return t;
    });
  }

  create(input: CreateJenisProjekInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      try {
        return await tx.jenisProjek.create({
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

  update(id: string, input: UpdateJenisProjekInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.jenisProjek.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Jenis projek tidak ditemukan');
      const data: Prisma.JenisProjekUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.aktif !== undefined) data.aktif = input.aktif;
      if (input.urutan !== undefined) data.urutan = input.urutan;
      try {
        return await tx.jenisProjek.update({ where: { id }, data });
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
      const used = await tx.project.count({ where: { jenisProjekId: id } });
      if (used > 0) {
        throw new BadRequestException(
          `Jenis dipakai oleh ${used} projek — set nonaktif saja supaya data lama tetap utuh`,
        );
      }
      await tx.jenisProjek.delete({ where: { id } });
      return { removed: true };
    });
  }
}
