import { Controller, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { readBuktiUploads, type RequestWithFiles } from '../../common/http/bukti-upload.js';
import { saveBukti } from '../../common/storage/bukti-storage.js';

@Controller('uploads')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class UploadsController {
  constructor(private readonly ctx: TenantContext) {}

  /**
   * Upload beberapa file bukti transaksi. Disimpan per-tenant di
   * `uploads/bukti/<tenantId>/`; return daftar { name, url } (URL publik
   * relatif) untuk dimasukkan ke `linkBuktiTambahan` dokumen.
   */
  @Post('bukti')
  async uploadBukti(@Req() req: RequestWithFiles) {
    const { tenantId } = this.ctx.require();
    const files = await readBuktiUploads(req);
    const out: Array<{ name: string; url: string }> = [];
    for (const f of files) {
      out.push({ name: f.filename, url: await saveBukti(tenantId, f.buffer, f.ext) });
    }
    return { files: out };
  }
}
