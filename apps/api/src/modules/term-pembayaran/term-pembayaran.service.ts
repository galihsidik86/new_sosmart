import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreateTermPembayaranInput {
  nama: string;
  hari: number;
  urutan?: number;
}

export interface UpdateTermPembayaranInput {
  nama?: string;
  hari?: number;
  aktif?: boolean;
  urutan?: number;
}

@Injectable()
export class TermPembayaranService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(includeInactive = false) {
    return this.tenancy.run((tx) =>
      tx.termPembayaran.findMany({
        where: includeInactive ? {} : { aktif: true },
        orderBy: [{ aktif: 'desc' }, { urutan: 'asc' }, { hari: 'asc' }],
        include: {
          _count: { select: { salesInvoices: true, purchaseInvoices: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const t = await tx.termPembayaran.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Termin pembayaran tidak ditemukan');
      return t;
    });
  }

  create(input: CreateTermPembayaranInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      try {
        return await tx.termPembayaran.create({
          data: {
            tenantId,
            nama: input.nama.trim(),
            hari: input.hari,
            urutan: input.urutan ?? 0,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Termin "${input.nama}" sudah ada`);
        }
        throw e;
      }
    });
  }

  update(id: string, input: UpdateTermPembayaranInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.termPembayaran.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Termin pembayaran tidak ditemukan');
      const data: Prisma.TermPembayaranUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.hari !== undefined) data.hari = input.hari;
      if (input.aktif !== undefined) data.aktif = input.aktif;
      if (input.urutan !== undefined) data.urutan = input.urutan;
      try {
        return await tx.termPembayaran.update({ where: { id }, data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Termin "${input.nama}" sudah ada`);
        }
        throw e;
      }
    });
  }

  async delete(id: string) {
    return this.tenancy.run(async (tx) => {
      const used =
        (await tx.salesInvoice.count({ where: { termPembayaranId: id } })) +
        (await tx.purchaseInvoice.count({ where: { termPembayaranId: id } }));
      if (used > 0) {
        throw new BadRequestException(
          `Termin dipakai oleh ${used} faktur — set nonaktif saja supaya riwayat tetap utuh`,
        );
      }
      await tx.termPembayaran.delete({ where: { id } });
      return { removed: true };
    });
  }
}
