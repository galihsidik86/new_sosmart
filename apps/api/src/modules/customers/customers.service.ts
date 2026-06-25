import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import type { CreateCustomerInput } from '@lentera/shared/schemas';

@Injectable()
export class CustomersService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  list(opts: { search?: string; onlyActive?: boolean; tipe?: string }) {
    const where: Prisma.CustomerWhereInput = {};
    if (opts.onlyActive ?? true) where.isAktif = true;
    if (opts.tipe) where.tipe = opts.tipe as Prisma.CustomerWhereInput['tipe'];
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
        { npwp: { contains: opts.search } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.customer.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: {
          akunPiutang: { select: { id: true, kode: true, nama: true } },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const c = await tx.customer.findUnique({
        where: { id },
        include: { akunPiutang: true },
      });
      if (!c) throw new NotFoundException('Pelanggan tidak ditemukan');
      return c;
    });
  }

  async create(input: CreateCustomerInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.customer.create({
          data: { tenantId, ...input },
        }),
      )
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Kode pelanggan sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateCustomerInput>) {
    return this.tenancy.run((tx) =>
      tx.customer.update({ where: { id }, data: patch }),
    );
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.customer.update({ where: { id }, data: { isAktif: false } }),
    );
  }
}
