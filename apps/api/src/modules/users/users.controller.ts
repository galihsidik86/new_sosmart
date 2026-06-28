import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@lentera/db';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';

const createSchema = z.object({
  email: z.string().email(),
  nama: z.string().min(2).max(120),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role),
  cabangIds: z.array(z.string().uuid()).default([]),
});
type CreateInput = z.infer<typeof createSchema>;

const updateSchema = z.object({
  nama: z.string().min(2).max(120).optional(),
  role: z.nativeEnum(Role).optional(),
  cabangIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(),
});
type UpdateInput = z.infer<typeof updateSchema>;

@Controller('users')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
@Roles('OWNER', 'ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':userId')
  byId(@Param('userId') userId: string) {
    return this.users.byUserId(userId);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.users.create(body);
  }

  @Patch(':userId')
  update(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput,
  ) {
    return this.users.update(userId, body);
  }

  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.users.remove(userId);
  }
}
