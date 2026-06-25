import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  loginInputSchema,
  type LoginInput,
  refreshInputSchema,
} from '@lentera/shared/schemas';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginInputSchema)) body: LoginInput,
    @Req() req: { headers: Record<string, string>; ip?: string },
  ) {
    return this.auth.login(body.email, body.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshInputSchema))
    body: { refreshToken: string },
  ) {
    if (!body.refreshToken) throw new UnauthorizedException();
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: { refreshToken?: string }) {
    if (body.refreshToken) await this.auth.logout(body.refreshToken);
  }
}
