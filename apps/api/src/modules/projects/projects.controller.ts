import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { ProjectMemberRole, ProjectStatus, ProjectPrioritas, ProjectTaskStatus } from '@lentera/db';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { ProjectsService } from './projects.service.js';

const money = z.string().regex(/^\d+(\.\d{1,2})?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  kode: z.string().min(1).max(30),
  nama: z.string().min(2).max(200),
  deskripsi: z.string().max(1000).optional(),
  tanggalMulai: isoDate,
  tanggalSelesai: isoDate.optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  prioritas: z.nativeEnum(ProjectPrioritas).optional(),
  budgetTotal: money.optional(),
  nilaiKontrak: money.nullable().optional(),
  catatan: z.string().max(1000).optional(),
  industriId: z.string().uuid().nullable().optional(),
  pjUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
});
type CreateInput = z.infer<typeof createSchema>;

const updateSchema = z.object({
  nama: z.string().min(2).max(200).optional(),
  deskripsi: z.string().max(1000).nullable().optional(),
  tanggalMulai: isoDate.optional(),
  tanggalSelesai: isoDate.nullable().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  prioritas: z.nativeEnum(ProjectPrioritas).optional(),
  budgetTotal: money.nullable().optional(),
  nilaiKontrak: money.nullable().optional(),
  catatan: z.string().max(1000).nullable().optional(),
  industriId: z.string().uuid().nullable().optional(),
  pjUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
});
type UpdateInput = z.infer<typeof updateSchema>;

const taskCreateSchema = z.object({
  nama: z.string().min(1).max(200),
  deskripsi: z.string().max(1000).nullable().optional(),
  pjUserId: z.string().uuid().nullable().optional(),
  tenggat: isoDate.nullable().optional(),
  status: z.nativeEnum(ProjectTaskStatus).optional(),
});
type TaskCreateInput = z.infer<typeof taskCreateSchema>;

const taskUpdateSchema = z.object({
  nama: z.string().min(1).max(200).optional(),
  deskripsi: z.string().max(1000).nullable().optional(),
  pjUserId: z.string().uuid().nullable().optional(),
  tenggat: isoDate.nullable().optional(),
  status: z.nativeEnum(ProjectTaskStatus).optional(),
  urutan: z.coerce.number().int().min(0).optional(),
});
type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(ProjectMemberRole).default(ProjectMemberRole.MEMBER),
});
type MemberInput = z.infer<typeof memberSchema>;

const setRoleSchema = z.object({
  role: z.nativeEnum(ProjectMemberRole),
});
type SetRoleInput = z.infer<typeof setRoleSchema>;

const budgetSchema = z.object({
  accountId: z.string().uuid(),
  periode: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  hardBlock: z.boolean().optional(),
  catatan: z.string().max(500).optional(),
});
type BudgetInput = z.infer<typeof budgetSchema>;

@Controller('projects')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list(@Query('includeSelesai') includeSelesai?: string) {
    return this.svc.list(includeSelesai === 'true');
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput,
  ) {
    return this.svc.update(id, body);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(memberSchema)) body: MemberInput,
  ) {
    return this.svc.addMember(id, body.userId, body.role);
  }

  @Patch(':id/members/:userId')
  setMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(setRoleSchema)) body: SetRoleInput,
  ) {
    return this.svc.setMemberRole(id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.removeMember(id, userId);
  }

  @Post(':id/budgets')
  setBudget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(budgetSchema)) body: BudgetInput,
  ) {
    return this.svc.setBudget({
      projectId: id,
      accountId: body.accountId,
      periode: body.periode,
      amount: body.amount,
      hardBlock: body.hardBlock,
      catatan: body.catatan,
    });
  }

  @Delete('budgets/:budgetId')
  removeBudget(@Param('budgetId') budgetId: string) {
    return this.svc.removeBudget(budgetId);
  }

  // ---------- Tugas / milestone ----------

  @Post(':id/tasks')
  addTask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(taskCreateSchema)) body: TaskCreateInput,
  ) {
    return this.svc.addTask(id, body);
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(taskUpdateSchema)) body: TaskUpdateInput,
  ) {
    return this.svc.updateTask(id, taskId, body);
  }

  @Delete(':id/tasks/:taskId')
  deleteTask(@Param('id') id: string, @Param('taskId') taskId: string) {
    return this.svc.deleteTask(id, taskId);
  }
}
