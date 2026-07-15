import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ConsolidationService } from './consolidation.service.js';

const createGroupSchema = z.object({ nama: z.string().min(2).max(200) });
type CreateGroupInput = z.infer<typeof createGroupSchema>;

const addMemberSchema = z.object({
  memberTenantId: z.string().uuid(),
  ownershipPct: z.union([z.number(), z.string()]).transform((v) => String(v)),
});
type AddMemberInput = z.infer<typeof addMemberSchema>;

@Controller('consolidation')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class ConsolidationController {
  constructor(private readonly svc: ConsolidationService) {}

  @Get('groups')
  listGroups() {
    return this.svc.listGroups();
  }

  @Get('candidates')
  candidates() {
    return this.svc.candidateTenants();
  }

  @Get('report')
  report(
    @Query('groupId') groupId: string,
    @Query('endDate') endDate: string,
    @Query('startDate') startDate?: string,
  ) {
    return this.svc.consolidate({ groupId, startDate, endDate });
  }

  @Post('groups')
  @Roles('OWNER', 'ADMIN')
  createGroup(@Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput) {
    return this.svc.createGroup(body.nama);
  }

  @Delete('groups/:id')
  @Roles('OWNER', 'ADMIN')
  deleteGroup(@Param('id') id: string) {
    return this.svc.deleteGroup(id);
  }

  @Post('groups/:id/members')
  @Roles('OWNER', 'ADMIN')
  addMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMemberSchema)) body: AddMemberInput,
  ) {
    return this.svc.addMember(id, body.memberTenantId, body.ownershipPct);
  }

  @Delete('members/:id')
  @Roles('OWNER', 'ADMIN')
  removeMember(@Param('id') id: string) {
    return this.svc.removeMember(id);
  }
}
