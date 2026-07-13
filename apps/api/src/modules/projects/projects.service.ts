import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectMemberRole, ProjectStatus } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

/**
 * Project = wadah budgeting + reporting per-project.
 *
 * Aturan akses (fase A):
 *  - OWNER/ADMIN tenant → lihat + kelola semua project di tenant.
 *  - User biasa → hanya lihat project yang dia jadi member (ProjectMember).
 *  - Semua mutasi (create/update/delete member) untuk fase A dibatasi ke
 *    OWNER/ADMIN + Project MANAGER. Ini akan diperluas di fase E (budget
 *    override step-up).
 */
export interface CreateProjectInput {
  kode: string;
  nama: string;
  deskripsi?: string;
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai?: string;
  budgetTotal?: string;
  catatan?: string;
  industriId?: string | null;
}

export interface UpdateProjectInput {
  nama?: string;
  deskripsi?: string | null;
  tanggalSelesai?: string | null;
  status?: ProjectStatus;
  budgetTotal?: string | null;
  catatan?: string | null;
  industriId?: string | null;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  /**
   * Kalau caller MANAGER project atau OWNER/ADMIN tenant, boleh manage.
   * Pakai `tx` supaya query hormat RLS + konsisten dgn transaksi pemanggil.
   */
  private async assertCanManage(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<void> {
    const { userId, role } = this.ctx.require();
    if (role === 'OWNER' || role === 'ADMIN') return;
    const pm = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    if (!pm || pm.role !== ProjectMemberRole.MANAGER) {
      throw new ForbiddenException(
        'Hanya OWNER/ADMIN tenant atau MANAGER project yang boleh mengelola',
      );
    }
  }

  async list(includeSelesai = false) {
    const tenantId = this.ctx.require().tenantId;
    const { userId, role } = this.ctx.require();
    return this.tenancy.run(async (tx) => {
      const where: Prisma.ProjectWhereInput = { tenantId };
      if (!includeSelesai) where.status = ProjectStatus.AKTIF;
      // Non OWNER/ADMIN → filter ke project yang dia jadi member
      if (role !== 'OWNER' && role !== 'ADMIN') {
        where.members = { some: { userId } };
      }
      return tx.project.findMany({
        where,
        orderBy: [{ status: 'asc' }, { kode: 'asc' }],
        include: {
          industri: { select: { id: true, kode: true, nama: true } },
          _count: { select: { members: true, budgets: true } },
        },
      });
    });
  }

  async byId(id: string) {
    const tenantId = this.ctx.require().tenantId;
    const { userId, role } = this.ctx.require();
    return this.tenancy.run(async (tx) => {
      const p = await tx.project.findUnique({
        where: { id },
        include: {
          industri: { select: { id: true, kode: true, nama: true } },
          members: {
            include: { user: { select: { id: true, email: true, nama: true } } },
          },
          budgets: {
            include: { account: { select: { kode: true, nama: true } } },
            orderBy: [{ periode: 'asc' }, { account: { kode: 'asc' } }],
          },
        },
      });
      if (!p || p.tenantId !== tenantId) {
        throw new NotFoundException('Project tidak ditemukan');
      }
      if (role !== 'OWNER' && role !== 'ADMIN') {
        const isMember = p.members.some((m) => m.userId === userId);
        if (!isMember) throw new ForbiddenException('Tidak boleh lihat project ini');
      }
      return p;
    });
  }

  async create(input: CreateProjectInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const role = this.ctx.require().role;
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Hanya OWNER/ADMIN yang boleh membuat project');
    }
    return this.tenancy.run(async (tx) => {
      const tanggalMulai = new Date(input.tanggalMulai + 'T00:00:00Z');
      const tanggalSelesai = input.tanggalSelesai
        ? new Date(input.tanggalSelesai + 'T00:00:00Z')
        : null;
      if (tanggalSelesai && tanggalSelesai < tanggalMulai) {
        throw new BadRequestException(
          'Tanggal selesai tidak boleh sebelum tanggal mulai',
        );
      }
      try {
        return await tx.project.create({
          data: {
            tenantId,
            kode: input.kode.trim(),
            nama: input.nama.trim(),
            deskripsi: input.deskripsi ?? null,
            tanggalMulai,
            tanggalSelesai,
            status: ProjectStatus.AKTIF,
            budgetTotal: input.budgetTotal ?? null,
            catatan: input.catatan ?? null,
            industriId: input.industriId ?? null,
            createdById: userId,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException(`Kode project ${input.kode} sudah dipakai`);
        }
        throw e;
      }
    });
  }

  async update(id: string, input: UpdateProjectInput) {
    await this.byId(id); // memastikan access + existence
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, id);
      const data: Prisma.ProjectUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.deskripsi !== undefined) data.deskripsi = input.deskripsi;
      if (input.tanggalSelesai !== undefined) {
        data.tanggalSelesai = input.tanggalSelesai
          ? new Date(input.tanggalSelesai + 'T00:00:00Z')
          : null;
      }
      if (input.status !== undefined) data.status = input.status;
      if (input.budgetTotal !== undefined) data.budgetTotal = input.budgetTotal;
      if (input.catatan !== undefined) data.catatan = input.catatan;
      if (input.industriId !== undefined) {
        data.industri = input.industriId
          ? { connect: { id: input.industriId } }
          : { disconnect: true };
      }
      return tx.project.update({ where: { id }, data });
    });
  }

  // ---------- Member ----------

  async addMember(projectId: string, userId: string, role: ProjectMemberRole) {
    await this.byId(projectId);
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      // Validate user berada di membership tenant
      const tenantId = this.ctx.require().tenantId;
      const membership = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!membership) {
        throw new BadRequestException('User bukan anggota tenant');
      }
      try {
        return await tx.projectMember.create({
          data: { projectId, userId, role },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException('User sudah jadi member project ini');
        }
        throw e;
      }
    });
  }

  async removeMember(projectId: string, userId: string) {
    await this.byId(projectId);
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      await tx.projectMember.deleteMany({
        where: { projectId, userId },
      });
      return { removed: true };
    });
  }

  async setMemberRole(projectId: string, userId: string, role: ProjectMemberRole) {
    await this.byId(projectId);
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      const pm = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!pm) throw new NotFoundException('Member tidak ditemukan');
      return tx.projectMember.update({
        where: { id: pm.id },
        data: { role },
      });
    });
  }

  // ---------- Budget ----------

  async setBudget(input: {
    projectId: string;
    accountId: string;
    periode: string; // YYYY-MM
    amount: string;
    hardBlock?: boolean;
    catatan?: string;
  }) {
    await this.byId(input.projectId);
    if (!/^\d{4}-\d{2}$/.test(input.periode)) {
      throw new BadRequestException('Periode harus format YYYY-MM');
    }
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, input.projectId);
      // Validasi akun ada di tenant + postable
      const acc = await tx.account.findUnique({ where: { id: input.accountId } });
      if (!acc || acc.tenantId !== tenantId) {
        throw new BadRequestException('Akun tidak ditemukan');
      }
      if (!acc.isPostable) {
        throw new BadRequestException(
          `Akun ${acc.kode} bukan akun postable — tidak bisa dianggarkan`,
        );
      }
      return tx.budget.upsert({
        where: {
          projectId_accountId_periode: {
            projectId: input.projectId,
            accountId: input.accountId,
            periode: input.periode,
          },
        },
        create: {
          tenantId,
          projectId: input.projectId,
          accountId: input.accountId,
          periode: input.periode,
          amount: input.amount,
          hardBlock: input.hardBlock ?? true,
          catatan: input.catatan ?? null,
          createdById: userId,
        },
        update: {
          amount: input.amount,
          hardBlock: input.hardBlock ?? true,
          catatan: input.catatan ?? null,
        },
      });
    });
  }

  async removeBudget(budgetId: string) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const b = await tx.budget.findUnique({ where: { id: budgetId } });
      if (!b) throw new NotFoundException('Budget tidak ditemukan');
      // Defense-in-depth: kalau RLS lolos (mis. app_current_tenant() null),
      // tolak tegas kalau tenant tidak cocok.
      if (b.tenantId !== tenantId) {
        throw new NotFoundException('Budget tidak ditemukan');
      }
      await this.assertCanManage(tx, b.projectId);
      await tx.budget.delete({ where: { id: budgetId } });
      return { removed: true };
    });
  }
}
