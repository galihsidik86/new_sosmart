import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@lentera/db';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const role: Role | undefined = req.tenantCtx?.role;
    if (!role) throw new ForbiddenException('Tenant context tidak ditemukan');
    if (!required.includes(role)) {
      throw new ForbiddenException(`Akses ditolak — perlu role ${required.join('/')}`);
    }
    return true;
  }
}
