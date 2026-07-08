import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { Prisma, Role } from '@lentera/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';

/**
 * Modul manajemen user dalam scope satu tenant.
 *
 * Akses:
 *  - OWNER / unrestricted ADMIN: lihat & atur semua user di tenant
 *  - ADMIN dengan cabang restriction: lihat & atur user yang HANYA akses
 *    cabang yang sama dengan dirinya. Tidak boleh menaikkan role atau
 *    memberi akses cabang di luar scope-nya. Tidak bisa lihat / atur OWNER
 *    atau user unrestricted.
 *
 * Operasi:
 *  - list, byUserId, create, update, remove (hapus membership di tenant).
 *  - User row itu sendiri shared antar tenant (1 email = 1 row). Hapus user
 *    dari tenant ini = hapus membership, BUKAN hapus user record.
 */
export interface UserListRow {
  userId: string;
  email: string;
  nama: string;
  isActive: boolean;
  role: Role;
  cabang: Array<{ id: string; kode: string; nama: string }>;
  /** True kalau user tanpa membership_cabang rows (akses semua cabang). */
  isUnrestricted: boolean;
}

export interface CreateUserInput {
  email: string;
  nama: string;
  password: string;
  role: Role;
  /** Empty = unrestricted (semua cabang). */
  cabangIds: string[];
}

export interface UpdateUserInput {
  nama?: string;
  role?: Role;
  cabangIds?: string[];
  isActive?: boolean;
  /** Optional reset password. */
  password?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly cabangScope: CabangScopeService,
  ) {}

  // ----------------------------------------------------------
  // Access guards
  // ----------------------------------------------------------

  /**
   * Validasi user calling boleh manage user target dengan cabangIds tertentu.
   * Aturan:
   *   - Full access (OWNER) → boleh apapun.
   *   - Restricted ADMIN → target's cabangIds tidak boleh kosong (target
   *     harus restricted juga), dan SETIAP cabangId target harus dalam
   *     allowed set caller. Plus, role yang di-assign tidak boleh OWNER.
   */
  private assertCanManage(targetCabangIds: string[], targetRole: Role | undefined): void {
    if (this.cabangScope.hasFullAccess()) return;
    if (targetRole === Role.OWNER) {
      throw new ForbiddenException('Admin cabang tidak boleh assign role OWNER');
    }
    if (targetCabangIds.length === 0) {
      throw new ForbiddenException(
        'Admin cabang tidak boleh assign user tanpa restriction cabang (unrestricted)',
      );
    }
    for (const id of targetCabangIds) {
      this.cabangScope.assertAccess(id);
    }
  }

  /**
   * assertCanManage() di atas cuma assertAccess() biasa — no-op untuk
   * OWNER/unrestricted ADMIN (hasFullAccess), jadi tidak pernah verifikasi
   * cabangId itu benar-benar milik tenant ini. Beda dari 15 titik lain yang
   * dibenerin pakai CabangScopeService.assertOwnedByTenant(tx, id), method
   * ini dipanggil SEBELUM tenancy.run() dibuka di create()/update() (tidak
   * ada `tx` di scope saat itu) — jadi query verifikasi-nya dibuat mandiri
   * di sini, bukan restrukturisasi assertCanManage jadi async+tx.
   */
  private async assertCabangIdsOwnedByTenant(cabangIds: string[]): Promise<void> {
    if (cabangIds.length === 0) return;
    await this.tenancy.run(async (tx) => {
      const count = await tx.cabang.count({ where: { id: { in: cabangIds } } });
      if (count !== cabangIds.length) {
        throw new BadRequestException('Ada cabangId yang tidak ditemukan di tenant ini');
      }
    });
  }

  /**
   * Filter view target user: kalau caller restricted, hanya boleh lihat
   * user yang juga restricted ke cabang dalam scope caller. User OWNER /
   * unrestricted tidak visible.
   */
  private canView(targetCabangIds: string[]): boolean {
    if (this.cabangScope.hasFullAccess()) return true;
    if (targetCabangIds.length === 0) return false;
    const allowed = this.cabangScope.cabangIds!;
    return targetCabangIds.every((id) => allowed.includes(id));
  }

  // ----------------------------------------------------------
  // QUERY
  // ----------------------------------------------------------

  async list(): Promise<UserListRow[]> {
    const tenantId = this.ctx.require().tenantId;
    const scope = this.cabangScope.cabangIdsForWhere();
    // tenancy.run set GUC tenant_id, jadi findMany membership sudah
    // scoped via RLS. Tapi RLS hanya tenant — filter cabang manual di atas.
    return this.tenancy.run(async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { tenantId },
        include: {
          user: {
            select: { id: true, email: true, nama: true, isActive: true },
          },
          cabang: {
            include: { cabang: { select: { kode: true, nama: true } } },
          },
        },
        orderBy: [{ role: 'asc' }, { user: { nama: 'asc' } }],
      });

      const rows: UserListRow[] = memberships.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        nama: m.user.nama,
        isActive: m.user.isActive,
        role: m.role,
        cabang: m.cabang.map((mc) => ({
          id: mc.cabangId,
          kode: mc.cabang.kode,
          nama: mc.cabang.nama,
        })),
        isUnrestricted: m.cabang.length === 0,
      }));

      if (!scope) return rows;
      // Restricted: hide users tanpa restriction + users dengan cabang di luar scope.
      return rows.filter((r) => !r.isUnrestricted && r.cabang.every((c) => scope.includes(c.id)));
    });
  }

  async byUserId(userId: string): Promise<UserListRow> {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const m = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        include: {
          user: { select: { id: true, email: true, nama: true, isActive: true } },
          cabang: {
            include: { cabang: { select: { kode: true, nama: true } } },
          },
        },
      });
      if (!m) throw new NotFoundException('User tidak ditemukan di tenant ini');
      const cabangIds = m.cabang.map((c) => c.cabangId);
      if (!this.canView(cabangIds)) {
        throw new ForbiddenException('Tidak punya akses untuk user ini');
      }
      return {
        userId: m.user.id,
        email: m.user.email,
        nama: m.user.nama,
        isActive: m.user.isActive,
        role: m.role,
        cabang: m.cabang.map((mc) => ({
          id: mc.cabangId,
          kode: mc.cabang.kode,
          nama: mc.cabang.nama,
        })),
        isUnrestricted: m.cabang.length === 0,
      };
    });
  }

  // ----------------------------------------------------------
  // MUTATIONS
  // ----------------------------------------------------------

  async create(input: CreateUserInput) {
    const tenantId = this.ctx.require().tenantId;
    this.assertCanManage(input.cabangIds, input.role);
    await this.assertCabangIdsOwnedByTenant(input.cabangIds);

    // User row level pakai PrismaService superuser (RLS bypass) karena users
    // tidak ber-tenant.
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    let userId: string;
    if (existing) {
      userId = existing.id;
      // Cek apakah sudah ada membership di tenant ini
      const dup = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (dup) throw new ConflictException('User sudah jadi anggota tenant ini');
    } else {
      const passwordHash = await argon2.hash(input.password);
      const u = await this.prisma.user.create({
        data: { email: input.email, nama: input.nama, passwordHash },
        select: { id: true },
      });
      userId = u.id;
    }

    // Membership + cabang via tenancy (RLS enforced).
    return this.tenancy.run(async (tx) => {
      const m = await tx.membership.create({
        data: {
          userId,
          tenantId,
          role: input.role,
          cabang: input.cabangIds.length
            ? { create: input.cabangIds.map((id) => ({ cabangId: id })) }
            : undefined,
        },
      });
      return { userId, membershipId: m.id };
    });
  }

  async update(userId: string, input: UpdateUserInput) {
    const tenantId = this.ctx.require().tenantId;
    // Resolve target first untuk validasi access.
    const current = await this.byUserId(userId); // throws kalau out of scope
    const newRole = input.role ?? current.role;
    const newCabangIds = input.cabangIds ?? current.cabang.map((c) => c.id);
    this.assertCanManage(newCabangIds, newRole);
    await this.assertCabangIdsOwnedByTenant(newCabangIds);

    // Update user-level fields via PrismaService.
    if (input.nama || input.password || input.isActive !== undefined) {
      const data: Prisma.UserUpdateInput = {};
      if (input.nama) data.nama = input.nama;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.password) data.passwordHash = await argon2.hash(input.password);
      await this.prisma.user.update({ where: { id: userId }, data });
    }

    // Update membership role + cabang (delete-recreate untuk simplisitas).
    return this.tenancy.run(async (tx) => {
      const m = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { id: true },
      });
      if (!m) throw new NotFoundException('Membership tidak ditemukan');
      await tx.membership.update({
        where: { id: m.id }, data: { role: newRole },
      });
      if (input.cabangIds !== undefined) {
        await tx.membershipCabang.deleteMany({ where: { membershipId: m.id } });
        if (newCabangIds.length) {
          await tx.membershipCabang.createMany({
            data: newCabangIds.map((id) => ({ membershipId: m.id, cabangId: id })),
          });
        }
      }
      return { userId };
    });
  }

  async remove(userId: string) {
    const tenantId = this.ctx.require().tenantId;
    await this.byUserId(userId); // validate access + existence
    if (userId === this.ctx.require().userId) {
      throw new BadRequestException('Tidak bisa hapus membership diri sendiri');
    }
    return this.tenancy.run(async (tx) => {
      await tx.membership.delete({
        where: { userId_tenantId: { userId, tenantId } },
      });
      return { userId };
    });
  }
}
