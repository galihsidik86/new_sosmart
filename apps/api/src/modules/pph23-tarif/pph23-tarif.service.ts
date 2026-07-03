import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreatePph23TarifInput {
  kode: string;
  nama: string;
  tarif: string; // decimal string
  keterangan?: string | null;
}

export interface UpdatePph23TarifInput {
  nama?: string;
  tarif?: string;
  keterangan?: string | null;
  isAktif?: boolean;
}

@Injectable()
export class Pph23TarifService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(includeInactive = false) {
    return this.tenancy.run((tx) =>
      tx.pph23Tarif.findMany({
        where: includeInactive ? {} : { isAktif: true },
        orderBy: [{ isAktif: 'desc' }, { kode: 'asc' }],
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const t = await tx.pph23Tarif.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Tarif PPh 23 tidak ditemukan');
      return t;
    });
  }

  create(input: CreatePph23TarifInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      try {
        return await tx.pph23Tarif.create({
          data: {
            tenantId,
            kode: input.kode.trim(),
            nama: input.nama.trim(),
            tarif: input.tarif,
            keterangan: input.keterangan ?? null,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Kode ${input.kode} sudah dipakai`);
        }
        throw e;
      }
    });
  }

  update(id: string, input: UpdatePph23TarifInput) {
    return this.tenancy.run(async (tx) => {
      const existing = await tx.pph23Tarif.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Tarif PPh 23 tidak ditemukan');
      const data: Prisma.Pph23TarifUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.tarif !== undefined) data.tarif = input.tarif;
      if (input.keterangan !== undefined) data.keterangan = input.keterangan;
      if (input.isAktif !== undefined) data.isAktif = input.isAktif;
      return tx.pph23Tarif.update({ where: { id }, data });
    });
  }

  async delete(id: string) {
    return this.tenancy.run(async (tx) => {
      // Kalau ada item yang refer, tolak — user harus soft-delete (isAktif=false) dulu.
      const usedByItems = await tx.item.count({ where: { pph23TarifId: id } });
      if (usedByItems > 0) {
        throw new BadRequestException(
          `Tarif dipakai oleh ${usedByItems} item — set isAktif=false atau ganti tarif item dulu`,
        );
      }
      await tx.pph23Tarif.delete({ where: { id } });
      return { removed: true };
    });
  }
}
