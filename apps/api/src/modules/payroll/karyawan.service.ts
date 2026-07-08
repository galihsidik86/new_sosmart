import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import { CabangScopeService } from '../../common/cabang-scope/cabang-scope.service.js';
import type { ImportResult } from '../../common/http/multipart.js';
import { PtkpStatus, JenisKaryawan } from '@lentera/db';
import type { CreateKaryawanInput } from '@lentera/shared/schemas';

@Injectable()
export class KaryawanService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
    private readonly cabangScope: CabangScopeService,
  ) {}

  async importXlsx(buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.ctx.require().tenantId;
    const rows = await this.excel.parseBuffer(buffer, ['Kode', 'Nama', 'NIK', 'PTKP']);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const allowedPtkp = new Set(Object.values(PtkpStatus) as string[]);
    const allowedJenis = new Set(Object.values(JenisKaryawan) as string[]);

    return this.tenancy.run(async (tx) => {
      const cabang = await tx.cabang.findMany({ select: { id: true, kode: true } });
      const cabangByKode = new Map(cabang.map((c) => [c.kode, c.id]));

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const xlsRow = i + 2;
        const kode = String(row['Kode'] ?? '').trim();
        const nama = String(row['Nama'] ?? '').trim();
        const nik = String(row['NIK'] ?? '').replace(/\D/g, '');
        if (!kode || !nama || !nik) {
          result.errors.push({ row: xlsRow, message: 'Kode, Nama & NIK wajib diisi' });
          result.skipped++;
          continue;
        }
        if (nik.length !== 16) {
          result.errors.push({ row: xlsRow, message: `NIK harus 16 digit (sekarang ${nik.length})` });
          result.skipped++;
          continue;
        }
        const ptkpRaw = String(row['PTKP'] ?? '').trim().toUpperCase().replace('/', '_');
        if (!allowedPtkp.has(ptkpRaw)) {
          result.errors.push({ row: xlsRow, message: `PTKP "${ptkpRaw}" tidak valid (mis. TK_0, K_1, HB_0)` });
          result.skipped++;
          continue;
        }
        const jenisRaw = String(row['Jenis'] ?? 'PEGAWAI_TETAP').trim().toUpperCase();
        if (!allowedJenis.has(jenisRaw)) {
          result.errors.push({ row: xlsRow, message: `Jenis "${jenisRaw}" tidak valid` });
          result.skipped++;
          continue;
        }

        const cabangKode = String(row['Cabang'] ?? '').trim();
        const cabangId = cabangKode ? cabangByKode.get(cabangKode) ?? null : null;

        const tanggalMasukRaw = row['Tanggal Masuk'];
        let tanggalMasuk: Date;
        if (tanggalMasukRaw instanceof Date) {
          tanggalMasuk = tanggalMasukRaw;
        } else if (typeof tanggalMasukRaw === 'string' && tanggalMasukRaw) {
          tanggalMasuk = new Date(tanggalMasukRaw);
        } else {
          tanggalMasuk = new Date();
        }

        try {
          await tx.karyawan.create({
            data: {
              tenantId,
              cabangId,
              kode, nama, nik,
              npwp: String(row['NPWP'] ?? '').replace(/\D/g, '') || null,
              jabatan: String(row['Jabatan'] ?? '').trim() || null,
              ptkpStatus: ptkpRaw as PtkpStatus,
              jenisKaryawan: jenisRaw as JenisKaryawan,
              tanggalMasuk,
              gajiPokok: String(Number(row['Gaji Pokok'] ?? 0)),
              tunjanganTetap: String(Number(row['Tunjangan'] ?? row['Tunjangan Tetap'] ?? 0)),
              iuranBpjsKaryawan: String(Number(row['BPJS Karyawan'] ?? row['Iuran BPJS Karyawan'] ?? 0)),
            },
          });
          result.created++;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            result.errors.push({ row: xlsRow, message: `Kode/NIK "${kode}/${nik}" sudah ada` });
          } else {
            result.errors.push({ row: xlsRow, message: e instanceof Error ? e.message : String(e) });
          }
          result.skipped++;
        }
      }
      return result;
    });
  }

  async exportXlsx(): Promise<Buffer> {
    const rows = await this.list({ isActive: false });
    return this.excel.buildBuffer(
      'Karyawan',
      [
        { header: 'Kode', key: 'kode', width: 12, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 28, value: (r) => r.nama },
        { header: 'NIK', key: 'nik', width: 20, value: (r) => r.nik },
        { header: 'NPWP', key: 'npwp', width: 20, value: (r) => r.npwp ?? '' },
        { header: 'Jabatan', key: 'jabatan', width: 18, value: (r) => r.jabatan ?? '' },
        { header: 'PTKP', key: 'ptkp', width: 8, value: (r) => r.ptkpStatus },
        { header: 'Jenis', key: 'jenis', width: 18, value: (r) => r.jenisKaryawan },
        { header: 'Cabang', key: 'cabang', width: 12, value: (r) => r.cabang?.kode ?? '' },
        { header: 'Gaji Pokok', key: 'gajiPokok', width: 14, format: 'currency', value: (r) => r.gajiPokok },
        { header: 'Tunjangan', key: 'tunjangan', width: 14, format: 'currency', value: (r) => r.tunjanganTetap },
        { header: 'BPJS Karyawan', key: 'bpjs', width: 14, format: 'currency', value: (r) => r.iuranBpjsKaryawan },
        { header: 'Aktif', key: 'aktif', width: 8, value: (r) => (r.isActive ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }

  list(opts: { isActive?: boolean; cabangId?: string; search?: string }) {
    const where: Prisma.KaryawanWhereInput = {};
    if (opts.isActive ?? true) where.isActive = true;
    if (opts.cabangId) where.cabangId = opts.cabangId;
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
        { nik: { contains: opts.search } },
        { npwp: { contains: opts.search } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.karyawan.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: { cabang: { select: { kode: true, nama: true } } },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const k = await tx.karyawan.findUnique({
        where: { id },
        include: { cabang: true },
      });
      if (!k) throw new NotFoundException('Karyawan tidak ditemukan');
      return k;
    });
  }

  async create(input: CreateKaryawanInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run(async (tx) => {
        // KaryawanService sebelumnya tidak inject CabangScopeService sama
        // sekali — cabangId (optional) dari input langsung jadi FK tanpa
        // verifikasi apa pun, bukan cuma no-op assertAccess seperti modul
        // lain. cabangId tenant lain (kalau ketebak) bisa lolos FK constraint.
        if (input.cabangId) {
          await this.cabangScope.assertOwnedByTenant(tx, input.cabangId);
        }
        return tx.karyawan.create({
          data: {
            tenantId,
            ...input,
            tanggalMasuk: new Date(input.tanggalMasuk + 'T00:00:00Z'),
            tanggalKeluar: input.tanggalKeluar
              ? new Date(input.tanggalKeluar + 'T00:00:00Z')
              : null,
          },
        });
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Kode karyawan sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateKaryawanInput>) {
    return this.tenancy.run(async (tx) => {
      if (patch.cabangId) {
        await this.cabangScope.assertOwnedByTenant(tx, patch.cabangId);
      }
      return tx.karyawan.update({
        where: { id },
        data: {
          ...patch,
          tanggalMasuk: patch.tanggalMasuk
            ? new Date(patch.tanggalMasuk + 'T00:00:00Z')
            : undefined,
          tanggalKeluar: patch.tanggalKeluar
            ? new Date(patch.tanggalKeluar + 'T00:00:00Z')
            : undefined,
        },
      });
    });
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.karyawan.update({ where: { id }, data: { isActive: false } }),
    );
  }
}
