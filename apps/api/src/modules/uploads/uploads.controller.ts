import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import path from 'node:path';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenancyInterceptor } from '../../common/interceptors/tenancy.interceptor.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { readBuktiUploads, type RequestWithFiles } from '../../common/http/bukti-upload.js';
import { saveBukti, readBukti } from '../../common/storage/bukti-storage.js';
import type { ReplyLike } from '../../common/http/reply.js';

const CONTENT_TYPE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

@Controller('uploads')
@UseGuards(TenantGuard)
@UseInterceptors(TenancyInterceptor)
export class UploadsController {
  constructor(private readonly ctx: TenantContext) {}

  /**
   * Upload beberapa file bukti transaksi. Disimpan privat per-tenant; return
   * daftar { name, url } (URL lewat proxy ber-otentikasi) untuk dimasukkan ke
   * `linkBuktiTambahan` dokumen.
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

  /**
   * Sajikan file bukti — BER-OTENTIKASI. JwtAuthGuard (global) memastikan user
   * login; TenantGuard memastikan user anggota tenant aktif; file dibaca HANYA
   * dari direktori tenant aktif → tenant lain tak bisa mengakses walau tahu
   * nama file. Dipanggil lewat proxy web (yang melampirkan token dari cookie).
   */
  @Get('bukti/:filename')
  async getBukti(@Param('filename') filename: string, @Res() reply: ReplyLike) {
    const { tenantId } = this.ctx.require();
    const buf = await readBukti(tenantId, filename);
    if (!buf) throw new NotFoundException('Bukti tidak ditemukan');
    const ctype = CONTENT_TYPE[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    reply
      .header('content-type', ctype)
      .header('content-disposition', `inline; filename="${path.basename(filename)}"`)
      .header('cache-control', 'private, max-age=60')
      .send(buf);
  }
}
