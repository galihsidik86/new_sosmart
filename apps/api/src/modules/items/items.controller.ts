import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type ReplyLike, sendXlsx } from '../../common/http/reply.js';
import { type RequestWithFile, readXlsxUpload } from '../../common/http/multipart.js';
import { Req } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createItemInputSchema,
  type CreateItemInput,
} from '@lentera/shared/schemas';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ItemsService } from './items.service.js';

@Controller('items')
@UseGuards(TenantGuard, RolesGuard)
@UseInterceptors(TenancyInterceptor)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get('export.xlsx')
  async exportXlsx(@Res() reply: ReplyLike) {
    sendXlsx(reply, 'items.xlsx', await this.items.exportXlsx());
  }

  @Post('import')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  async import(@Req() req: RequestWithFile) {
    const { buffer } = await readXlsxUpload(req);
    return this.items.importXlsx(buffer);
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.items.list({
      search,
      onlyActive: onlyActive !== 'false',
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.items.byId(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  create(
    @Body(new ZodValidationPipe(createItemInputSchema)) body: CreateItemInput,
  ) {
    return this.items.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'AKUNTAN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createItemInputSchema.partial()))
    body: Partial<CreateItemInput>,
  ) {
    return this.items.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Param('id') id: string) {
    return this.items.deactivate(id);
  }
}
