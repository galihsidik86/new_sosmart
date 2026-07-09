import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  updateTenantInputSchema,
  type UpdateTenantInput,
} from '@lentera/shared/schemas';
import { TenantsService } from './tenants.service.js';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { readImageUpload } from '../../common/http/image-upload.js';
import type { RequestWithFile } from '../../common/http/multipart.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /** Daftar tenant + role yang dimiliki user — dipanggil setelah login. */
  @Get('me')
  async myTenants(@CurrentUser() user: JwtUser) {
    return this.tenants.listMembershipsForUser(user.sub);
  }

  /** Profil perusahaan (tenant aktif) — semua role tenant boleh lihat. */
  @Get('current')
  @UseGuards(TenantGuard)
  @UseInterceptors(TenancyInterceptor)
  current() {
    return this.tenants.getCurrent();
  }

  @Patch('current')
  @UseGuards(TenantGuard, RolesGuard)
  @UseInterceptors(TenancyInterceptor)
  @Roles('OWNER', 'ADMIN')
  update(
    @Body(new ZodValidationPipe(updateTenantInputSchema)) body: UpdateTenantInput,
  ) {
    return this.tenants.updateProfile(body);
  }

  @Post('current/logo')
  @UseGuards(TenantGuard, RolesGuard)
  @UseInterceptors(TenancyInterceptor)
  @Roles('OWNER', 'ADMIN')
  async uploadLogo(@Req() req: RequestWithFile) {
    const { buffer, ext } = await readImageUpload(req);
    return this.tenants.updateLogo(buffer, ext);
  }

  @Delete('current/logo')
  @UseGuards(TenantGuard, RolesGuard)
  @UseInterceptors(TenancyInterceptor)
  @Roles('OWNER', 'ADMIN')
  removeLogo() {
    return this.tenants.removeLogo();
  }
}
