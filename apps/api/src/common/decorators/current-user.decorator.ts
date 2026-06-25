import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | unknown => {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtUser = req.user;
    return data ? user?.[data] : user;
  },
);
