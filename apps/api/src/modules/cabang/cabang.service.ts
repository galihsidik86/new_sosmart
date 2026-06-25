import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import type { CreateCabangInput } from '@lentera/shared/schemas';

@Injectable()
export class CabangService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

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
