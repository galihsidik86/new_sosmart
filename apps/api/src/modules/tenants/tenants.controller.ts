import { Controller, Get } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /** Daftar tenant + role yang dimiliki user — dipanggil setelah login. */
  @Get('me')
  async myTenants(@CurrentUser() user: JwtUser) {
    return this.tenants.listMembershipsForUser(user.sub);
  }
}
