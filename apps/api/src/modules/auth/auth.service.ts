import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import type { LoginResponse } from '@lentera/shared/schemas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<LoginResponse> {
    // Step 1: users table tidak ber-RLS, query langsung.
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email/password salah');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Email/password salah');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Step 2: memberships ber-RLS → pakai runAsUser supaya policy *_select
    //         membaca app.user_id.
    const memberships = await this.tenancy.runAsUser(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id },
        include: {
          tenant: { select: { id: true, nama: true } },
          cabang: { select: { cabangId: true } },
        },
      }),
    );

    const accessToken = await this.signAccess(user.id, user.email);
    const refreshToken = await this.issueRefresh(user.id, meta);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, nama: user.nama },
      memberships: memberships.map((m) => ({
        tenantId: m.tenant.id,
        tenantNama: m.tenant.nama,
        role: m.role,
        cabangIds: m.cabang.map((c) => c.cabangId),
      })),
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
    // Reuse detection: token yang SUDAH dirotasi (revokedAt terisi) tidak
    // seharusnya muncul lagi. Kemunculannya berarti ada salinan beredar —
    // kemungkinan dicuri. Karena kita tidak tahu salinan mana yang sah,
    // cabut SELURUH sesi aktif user ini dan paksa login ulang. Tanpa ini,
    // pencuri yang lebih dulu me-rotate token tetap memegang sesi valid
    // sampai masa berlaku habis.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sesi tidak valid — silakan login ulang');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('Akun tidak aktif');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await this.signAccess(stored.user.id, stored.user.email);
    const newRefresh = await this.issueRefresh(stored.user.id);
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  private async signAccess(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, email });
  }

  private async issueRefresh(
    userId: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<string> {
    const token = crypto.randomBytes(48).toString('base64url');
    const ttlDays = parseTtlDays(this.config.get('JWT_REFRESH_TTL') ?? '7d');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
        userAgent: meta?.userAgent,
        ipAddress: meta?.ip,
      },
    });
    return token;
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function parseTtlDays(s: string): number {
  const m = /^(\d+)d$/.exec(s);
  return m ? Number(m[1]) : 7;
}
