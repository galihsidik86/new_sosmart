import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { ProjectStatus } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { LabaRugiService, type LabaRugiResponse } from './laba-rugi.service.js';

export interface LabaRugiProyekRow {
  project: { id: string; kode: string; nama: string; status: string; industri: { kode: string; nama: string } | null };
  pendapatan: string;
  bebanPokok: string;
  bebanOperasi: string;
  labaBersih: string;
  marginPersen: string;
  /// Detail Laba Rugi lengkap proyek (untuk cetak detail per proyek).
  detail: LabaRugiResponse;
}

export interface LabaRugiProyekResponse {
  periode: { id: string; label: string };
  ytd: boolean;
  rows: LabaRugiProyekRow[];
  total: {
    pendapatan: string;
    bebanPokok: string;
    bebanOperasi: string;
    labaBersih: string;
    marginPersen: string;
  };
}

/**
 * Laba Rugi per Proyek (batch) — hitung Laba Rugi untuk SETIAP proyek aktif,
 * lalu susun ringkasan + detail. Dipakai untuk cetak seluruh proyek sekaligus.
 */
@Injectable()
export class LabaRugiProyekService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly lr: LabaRugiService,
  ) {}

  async build(opts: {
    periodId: string;
    ytd?: boolean;
    cabangId?: string;
    industriId?: string;
  }): Promise<LabaRugiProyekResponse> {
    const projects = await this.tenancy.run((tx) =>
      tx.project.findMany({
        where: {
          status: { in: [ProjectStatus.AKTIF, ProjectStatus.SELESAI] },
          ...(opts.industriId ? { industriId: opts.industriId } : {}),
        },
        orderBy: { kode: 'asc' },
        select: {
          id: true, kode: true, nama: true, status: true,
          industri: { select: { kode: true, nama: true } },
        },
      }),
    );

    const rows: LabaRugiProyekRow[] = [];
    let tPend = new Decimal(0);
    let tBp = new Decimal(0);
    let tBo = new Decimal(0);
    let tLb = new Decimal(0);
    let periode = { id: opts.periodId, label: '' };

    for (const p of projects) {
      const d = await this.lr.build({
        periodId: opts.periodId,
        ytd: opts.ytd,
        cabangId: opts.cabangId,
        projectId: p.id,
      });
      periode = { id: d.periode.id, label: d.periode.label };
      const pend = new Decimal(d.pendapatan.total);
      const bp = new Decimal(d.bebanPokok.total);
      const bo = new Decimal(d.bebanOperasi.total);
      const lb = new Decimal(d.labaBersih.nilai);
      rows.push({
        project: p,
        pendapatan: pend.toFixed(2),
        bebanPokok: bp.toFixed(2),
        bebanOperasi: bo.toFixed(2),
        labaBersih: lb.toFixed(2),
        marginPersen: pend.eq(0) ? '0.00' : lb.div(pend).mul(100).toFixed(2),
        detail: d,
      });
      tPend = tPend.plus(pend);
      tBp = tBp.plus(bp);
      tBo = tBo.plus(bo);
      tLb = tLb.plus(lb);
    }

    return {
      periode,
      ytd: opts.ytd ?? false,
      rows,
      total: {
        pendapatan: tPend.toFixed(2),
        bebanPokok: tBp.toFixed(2),
        bebanOperasi: tBo.toFixed(2),
        labaBersih: tLb.toFixed(2),
        marginPersen: tPend.eq(0) ? '0.00' : tLb.div(tPend).mul(100).toFixed(2),
      },
    };
  }
}
