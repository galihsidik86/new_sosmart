import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import type { CreateItemInput } from '@lentera/shared/schemas';

@Injectable()
export class ItemsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(opts: { search?: string; onlyActive?: boolean }) {
    const where: Prisma.ItemWhereInput = {};
    if (opts.onlyActive ?? true) where.isAktif = true;
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.item.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: {
          akunPendapatan: { select: { id: true, kode: true, nama: true } },
          akunPersediaan: { select: { id: true, kode: true, nama: true } },
          akunHpp: { select: { id: true, kode: true, nama: true } },
          stokAwal: {
            include: { cabang: { select: { id: true, kode: true, nama: true } } },
          },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id },
        include: {
          akunPendapatan: true,
          akunPersediaan: true,
          akunHpp: true,
          stokAwal: { include: { cabang: true } },
        },
      });
      if (!item) throw new NotFoundException('Item tidak ditemukan');
      return item;
    });
  }

  async create(input: CreateItemInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.item.create({
          data: {
            tenantId,
            kode: input.kode,
            nama: input.nama,
            kategori: input.kategori,
            satuan: input.satuan,
            hargaJualDefault: input.hargaJualDefault,
            klasifikasiPpn: input.klasifikasiPpn,
            isJasa: input.isJasa,
            kodeSatuanDjp: input.kodeSatuanDjp,
            akunPendapatanId: input.akunPendapatanId ?? null,
            akunPersediaanId: input.isJasa ? null : input.akunPersediaanId ?? null,
            akunHppId: input.isJasa ? null : input.akunHppId ?? null,
            catatan: input.catatan,
          },
        }),
      )
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Kode item sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateItemInput>) {
    return this.tenancy.run((tx) =>
      tx.item.update({
        where: { id },
        data: {
          ...patch,
          akunPersediaanId: patch.isJasa
            ? null
            : patch.akunPersediaanId ?? undefined,
          akunHppId: patch.isJasa ? null : patch.akunHppId ?? undefined,
        },
      }),
    );
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.item.update({ where: { id }, data: { isAktif: false } }),
    );
  }
}
