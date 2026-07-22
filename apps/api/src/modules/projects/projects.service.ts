import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectMemberRole, ProjectStatus, ProjectPrioritas, ProjectTaskStatus } from '@lentera/db';
import { Decimal } from 'decimal.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

/**
 * Peran tenant yang boleh MELIHAT semua projek (read-only untuk selain
 * OWNER/ADMIN). AKUNTAN & AUDITOR butuh visibilitas penuh untuk pembukuan/
 * audit (konsisten dgn laporan Laba Rugi per Proyek yang tak difilter
 * keanggotaan). KASIR tetap dibatasi keanggotaan projek.
 * Membuat/mengubah projek TETAP dibatasi (lihat create/assertCanManage).
 */
const VIEW_ALL_PROJECT_ROLES = new Set(['OWNER', 'ADMIN', 'AKUNTAN', 'AUDITOR']);

/**
 * Project = wadah budgeting + reporting per-project.
 *
 * Aturan akses:
 *  - OWNER/ADMIN tenant → lihat + kelola semua project di tenant.
 *  - AKUNTAN/AUDITOR → lihat SEMUA project (read-only), tak bisa buat/ubah.
 *  - User biasa (mis. KASIR) → hanya lihat project yang dia jadi member.
 *  - Mutasi (create) dibatasi OWNER/ADMIN; (update/member/budget/tugas)
 *    dibatasi OWNER/ADMIN + Project MANAGER.
 */
export interface CreateProjectInput {
  kode: string;
  nama: string;
  deskripsi?: string;
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai?: string;
  status?: ProjectStatus;
  prioritas?: ProjectPrioritas;
  budgetTotal?: string;
  nilaiKontrak?: string | null;
  catatan?: string;
  industriId?: string | null;
  jenisProjekId?: string | null;
  pjUserId?: string | null;
  customerId?: string | null;
  linkDokumen?: string[];
}

export interface UpdateProjectInput {
  nama?: string;
  deskripsi?: string | null;
  tanggalMulai?: string;
  tanggalSelesai?: string | null;
  status?: ProjectStatus;
  prioritas?: ProjectPrioritas;
  budgetTotal?: string | null;
  nilaiKontrak?: string | null;
  catatan?: string | null;
  industriId?: string | null;
  jenisProjekId?: string | null;
  pjUserId?: string | null;
  customerId?: string | null;
  linkDokumen?: string[];
}

export interface CreateTaskInput {
  nama: string;
  deskripsi?: string | null;
  pjUserId?: string | null;
  tenggat?: string | null;
  status?: ProjectTaskStatus;
  linkDokumen?: string[];
}

export interface UpdateTaskInput {
  nama?: string;
  deskripsi?: string | null;
  pjUserId?: string | null;
  tenggat?: string | null;
  status?: ProjectTaskStatus;
  urutan?: number;
  linkDokumen?: string[];
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
      // "aktif saja" = yang masih berjalan (bukan Selesai/Batal).
      if (!includeSelesai) {
        where.status = { notIn: [ProjectStatus.SELESAI, ProjectStatus.DIBATALKAN] };
      }
      // Peran view-all (OWNER/ADMIN/AKUNTAN/AUDITOR) lihat semua; selain itu
      // (mis. KASIR) hanya project yang dia jadi member.
      if (!VIEW_ALL_PROJECT_ROLES.has(role)) {
        where.members = { some: { userId } };
      }
      const rows = await tx.project.findMany({
        where,
        orderBy: [{ status: 'asc' }, { kode: 'asc' }],
        include: {
          industri: { select: { id: true, kode: true, nama: true } },
          jenisProjek: { select: { id: true, nama: true } },
          _count: { select: { members: true, budgets: true } },
          tasks: { select: { status: true } },
        },
      });
      // Resolusi nama PIC (batch) + hitung progres dari tugas.
      const pjIds = rows.map((r) => r.pjUserId).filter((x): x is string => !!x);
      const users = pjIds.length
        ? await tx.user.findMany({ where: { id: { in: pjIds } }, select: { id: true, nama: true } })
        : [];
      const umap = new Map(users.map((u) => [u.id, u.nama]));
      return rows.map((r) => {
        const total = r.tasks.length;
        const done = r.tasks.filter((t) => t.status === 'SELESAI').length;
        const { tasks, ...rest } = r;
        return {
          ...rest,
          pjNama: r.pjUserId ? umap.get(r.pjUserId) ?? null : null,
          taskTotal: total,
          taskDone: done,
          progress: total ? Math.round((done / total) * 100) : 0,
        };
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
          jenisProjek: { select: { id: true, nama: true } },
          members: {
            include: { user: { select: { id: true, email: true, nama: true } } },
          },
          budgets: {
            include: { account: { select: { kode: true, nama: true } } },
            orderBy: [{ periode: 'asc' }, { account: { kode: 'asc' } }],
          },
          tasks: { orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }] },
        },
      });
      if (!p || p.tenantId !== tenantId) {
        throw new NotFoundException('Project tidak ditemukan');
      }
      if (!VIEW_ALL_PROJECT_ROLES.has(role)) {
        const isMember = p.members.some((m) => m.userId === userId);
        if (!isMember) throw new ForbiddenException('Tidak boleh lihat project ini');
      }
      return p;
    });
  }

  /** Detail lengkap: byId + resolusi nama PIC/klien/assignee, progres, realisasi. */
  async detail(id: string) {
    const p = await this.byId(id);
    return this.tenancy.run(async (tx) => {
      const userIds = [
        ...(p.pjUserId ? [p.pjUserId] : []),
        ...p.tasks.map((t) => t.pjUserId).filter((x): x is string => !!x),
      ];
      const users = userIds.length
        ? await tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, nama: true, email: true },
          })
        : [];
      const umap = new Map(users.map((u) => [u.id, u]));
      const customer = p.customerId
        ? await tx.customer.findUnique({
            where: { id: p.customerId },
            select: { id: true, kode: true, nama: true },
          })
        : null;

      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === 'SELESAI').length;
      const progress = total ? Math.round((done / total) * 100) : 0;

      // Realisasi dari jurnal POSTED ber-project (biaya net & pendapatan net).
      const lines = await tx.journalLine.findMany({
        where: {
          projectId: id,
          journal: { status: 'POSTED' },
          account: { kind: { in: ['BEBAN_POKOK', 'BEBAN', 'BEBAN_LAIN', 'PENDAPATAN', 'PENDAPATAN_LAIN'] } },
        },
        select: { debit: true, kredit: true, account: { select: { kind: true } } },
      });
      let biaya = new Decimal(0);
      let pendapatan = new Decimal(0);
      for (const l of lines) {
        const d = new Decimal(l.debit.toString());
        const k = new Decimal(l.kredit.toString());
        if (l.account.kind === 'PENDAPATAN' || l.account.kind === 'PENDAPATAN_LAIN') {
          pendapatan = pendapatan.plus(k.minus(d));
        } else {
          biaya = biaya.plus(d.minus(k));
        }
      }

      return {
        ...p,
        pjUser: p.pjUserId ? umap.get(p.pjUserId) ?? null : null,
        customer,
        progress,
        taskDone: done,
        taskTotal: total,
        realisasiBiaya: biaya.toFixed(2),
        realisasiPendapatan: pendapatan.toFixed(2),
        tasks: p.tasks.map((t) => ({
          ...t,
          pjUser: t.pjUserId ? umap.get(t.pjUserId) ?? null : null,
        })),
      };
    });
  }

  // ---------- Tugas / milestone ----------

  async addTask(projectId: string, input: CreateTaskInput) {
    await this.byId(projectId);
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      const max = await tx.projectTask.aggregate({
        where: { projectId },
        _max: { urutan: true },
      });
      return tx.projectTask.create({
        data: {
          tenantId,
          projectId,
          nama: input.nama.trim(),
          deskripsi: input.deskripsi ?? null,
          pjUserId: input.pjUserId ?? null,
          tenggat: input.tenggat ? new Date(input.tenggat + 'T00:00:00Z') : null,
          status: input.status ?? ProjectTaskStatus.BELUM,
          urutan: (max._max.urutan ?? 0) + 1,
          selesaiAt: input.status === ProjectTaskStatus.SELESAI ? new Date() : null,
          linkDokumen: input.linkDokumen ?? [],
        },
      });
    });
  }

  async updateTask(projectId: string, taskId: string, input: UpdateTaskInput) {
    await this.byId(projectId);
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      const t = await tx.projectTask.findFirst({ where: { id: taskId, projectId } });
      if (!t) throw new NotFoundException('Tugas tidak ditemukan');
      const data: Prisma.ProjectTaskUpdateInput = {};
      if (input.nama !== undefined) data.nama = input.nama.trim();
      if (input.deskripsi !== undefined) data.deskripsi = input.deskripsi;
      if (input.pjUserId !== undefined) data.pjUserId = input.pjUserId;
      if (input.tenggat !== undefined) {
        data.tenggat = input.tenggat ? new Date(input.tenggat + 'T00:00:00Z') : null;
      }
      if (input.urutan !== undefined) data.urutan = input.urutan;
      if (input.linkDokumen !== undefined) data.linkDokumen = input.linkDokumen;
      if (input.status !== undefined) {
        data.status = input.status;
        data.selesaiAt = input.status === ProjectTaskStatus.SELESAI ? new Date() : null;
      }
      return tx.projectTask.update({ where: { id: taskId }, data });
    });
  }

  async deleteTask(projectId: string, taskId: string) {
    await this.byId(projectId);
    return this.tenancy.run(async (tx) => {
      await this.assertCanManage(tx, projectId);
      const t = await tx.projectTask.findFirst({ where: { id: taskId, projectId } });
      if (!t) throw new NotFoundException('Tugas tidak ditemukan');
      await tx.projectTask.delete({ where: { id: taskId } });
      return { removed: true };
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
            status: input.status ?? ProjectStatus.AKTIF,
            prioritas: input.prioritas ?? ProjectPrioritas.SEDANG,
            budgetTotal: input.budgetTotal ?? null,
            nilaiKontrak: input.nilaiKontrak ?? null,
            catatan: input.catatan ?? null,
            industriId: input.industriId ?? null,
            jenisProjekId: input.jenisProjekId ?? null,
            pjUserId: input.pjUserId ?? null,
            customerId: input.customerId ?? null,
            linkDokumen: input.linkDokumen ?? [],
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
      if (input.tanggalMulai !== undefined) {
        data.tanggalMulai = new Date(input.tanggalMulai + 'T00:00:00Z');
      }
      if (input.tanggalSelesai !== undefined) {
        data.tanggalSelesai = input.tanggalSelesai
          ? new Date(input.tanggalSelesai + 'T00:00:00Z')
          : null;
      }
      if (input.status !== undefined) data.status = input.status;
      if (input.prioritas !== undefined) data.prioritas = input.prioritas;
      if (input.budgetTotal !== undefined) data.budgetTotal = input.budgetTotal;
      if (input.nilaiKontrak !== undefined) data.nilaiKontrak = input.nilaiKontrak;
      if (input.catatan !== undefined) data.catatan = input.catatan;
      if (input.pjUserId !== undefined) data.pjUserId = input.pjUserId;
      if (input.customerId !== undefined) data.customerId = input.customerId;
      if (input.linkDokumen !== undefined) data.linkDokumen = input.linkDokumen;
      if (input.industriId !== undefined) {
        data.industri = input.industriId
          ? { connect: { id: input.industriId } }
          : { disconnect: true };
      }
      if (input.jenisProjekId !== undefined) {
        data.jenisProjek = input.jenisProjekId
          ? { connect: { id: input.jenisProjekId } }
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
