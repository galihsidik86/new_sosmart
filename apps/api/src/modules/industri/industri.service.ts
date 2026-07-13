import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreateIndustriInput {
  kode: string;
  nama: string;
}

export interface UpdateIndustriInput {
  nama?: string;
  isAktif?: boolean;
}

@Injectable()
export class IndustriService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(includeInactive = false) {
    return this.tenancy.run((tx) =>
      tx.industri.findMany({
        where: includeInactive ? {} : { isAktif: true },
        orderBy: [{ isAktif: 'desc' }, { nama: 'asc' }],
        include: { _count: { select: { projects: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const t = await tx.industri.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Jenis industri tidak ditemukan');
      return t;
    });
  }

  create(input: CreateIndustriInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      try {
        return await tx.industri.create({
          data: { tenantId, kode: input.kode.trim(), nama: input.nama.trim() },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Kode ${input.kode} sudah dipakai`);
        }
        throw e;
      }
    });
  }

  update(id: string, input: UpdateIndustriInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.industri.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Jenis industri tidak ditemukan');
      const data: Prisma.IndustriUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.isAktif !== undefined) data.isAktif = input.isAktif;
      return tx.industri.update({ where: { id }, data });
    });
  }

  async delete(id: string) {
    return this.tenancy.run(async (tx) => {
      const used = await tx.project.count({ where: { industriId: id } });
      if (used > 0) {
        throw new BadRequestException(
          `Industri dipakai oleh ${used} project — set nonaktif atau ganti industri project dulu`,
        );
      }
      await tx.industri.delete({ where: { id } });
      return { removed: true };
    });
  }
}
