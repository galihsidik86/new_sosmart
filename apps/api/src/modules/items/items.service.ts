import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';
import { ExcelService } from '../../common/excel/excel.service.js';
import type { ImportResult } from '../../common/http/multipart.js';
import { KlasifikasiPpn } from '@lentera/db';
import type { CreateItemInput } from '@lentera/shared/schemas';

@Injectable()
export class ItemsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
    private readonly excel: ExcelService,
  ) {}

  list(opts: { search?: string; onlyActive?: boolean }) {
    const where: Prisma.ItemWhereInput = {};
    if (opts.onlyActive ?? true) where.isAktif = true;
    if (opts.search) {
      where.OR = [
        { kode: { contains: opts.search, mode: 'insensitive' } },
        { nama: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    return this.tenancy.run((tx) =>
      tx.item.findMany({
        where,
        orderBy: { kode: 'asc' },
        include: {
          akunPendapatan: { select: { id: true, kode: true, nama: true } },
          akunPersediaan: { select: { id: true, kode: true, nama: true } },
          akunHpp: { select: { id: true, kode: true, nama: true } },
          stokAwal: {
            include: { cabang: { select: { id: true, kode: true, nama: true } } },
          },
        },
      }),
    );
  }

  byId(id: string) {
    return this.tenancy.run(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id },
        include: {
          akunPendapatan: true,
          akunPersediaan: true,
          akunHpp: true,
          stokAwal: { include: { cabang: true } },
        },
      });
      if (!item) throw new NotFoundException('Item tidak ditemukan');
      return item;
    });
  }

  async create(input: CreateItemInput) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy
      .run((tx) =>
        tx.item.create({
          data: {
            tenantId,
            kode: input.kode,
            nama: input.nama,
            kategori: input.kategori,
            satuan: input.satuan,
            hargaJualDefault: input.hargaJualDefault,
            klasifikasiPpn: input.klasifikasiPpn,
            isJasa: input.isJasa,
            kodeSatuanDjp: input.kodeSatuanDjp,
            akunPendapatanId: input.akunPendapatanId ?? null,
            akunPersediaanId: input.isJasa ? null : input.akunPersediaanId ?? null,
            akunHppId: input.isJasa ? null : input.akunHppId ?? null,
            catatan: input.catatan,
          },
        }),
      )
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Kode item sudah dipakai');
        }
        throw e;
      });
  }

  async update(id: string, patch: Partial<CreateItemInput>) {
    return this.tenancy.run((tx) =>
      tx.item.update({
        where: { id },
        data: {
          ...patch,
          akunPersediaanId: patch.isJasa
            ? null
            : patch.akunPersediaanId ?? undefined,
          akunHppId: patch.isJasa ? null : patch.akunHppId ?? undefined,
        },
      }),
    );
  }

  async deactivate(id: string) {
    return this.tenancy.run((tx) =>
      tx.item.update({ where: { id }, data: { isAktif: false } }),
    );
  }

  /**
   * Import items dari .xlsx. Header yang dibutuhkan: Kode, Nama.
   * Optional headers: Kategori, Satuan, Harga Jual, Klasifikasi PPN, Jasa,
   * Akun Pendapatan (format "1-101" atau "1-101 nama"), Akun Persediaan, Akun HPP.
   *
   * Conflict (kode sudah ada) di-report sebagai skipped + error message,
   * tidak menggagalkan whole batch.
   */
  async importXlsx(buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.ctx.require().tenantId;
    const rows = await this.excel.parseBuffer(buffer, ['Kode', 'Nama']);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    return this.tenancy.run(async (tx) => {
      // Pre-load akun untuk resolve by kode
      const accounts = await tx.account.findMany({ select: { id: true, kode: true } });
      const akunByKode = new Map(accounts.map((a) => [a.kode, a.id]));
      const resolveAkun = (raw: unknown): string | null => {
        if (!raw) return null;
        const s = String(raw).trim();
        if (!s) return null;
        // accept "1-101" or "1-101 nama akun"
        const kode = s.split(/\s/)[0]!;
        return akunByKode.get(kode) ?? null;
      };

      const allowedKlasifikasi = new Set(Object.values(KlasifikasiPpn) as string[]);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const xlsRow = i + 2; // 1-indexed + 1 for header

        const kode = String(row['Kode'] ?? '').trim();
        const nama = String(row['Nama'] ?? '').trim();
        if (!kode || !nama) {
          result.errors.push({ row: xlsRow, message: 'Kode & Nama wajib diisi' });
          result.skipped++;
          continue;
        }

        const klasifikasiRaw = String(row['Klasifikasi PPN'] ?? 'BKP').trim().toUpperCase();
        if (!allowedKlasifikasi.has(klasifikasiRaw)) {
          result.errors.push({
            row: xlsRow,
            message: `Klasifikasi PPN "${klasifikasiRaw}" tidak valid (BKP/JKP/NON_BKP/BKP_STRATEGIS/BEBAS_PPN)`,
          });
          result.skipped++;
          continue;
        }

        const isJasa = ['ya', 'y', 'true', '1'].includes(String(row['Jasa'] ?? '').toLowerCase().trim());

        try {
          await tx.item.create({
            data: {
              tenantId,
              kode,
              nama,
              kategori: String(row['Kategori'] ?? '').trim() || null,
              satuan: String(row['Satuan'] ?? 'Pcs').trim() || 'Pcs',
              hargaJualDefault: String(Number(row['Harga Jual'] ?? 0)),
              klasifikasiPpn: klasifikasiRaw as KlasifikasiPpn,
              isJasa,
              akunPendapatanId: resolveAkun(row['Akun Pendapatan']),
              akunPersediaanId: isJasa ? null : resolveAkun(row['Akun Persediaan']),
              akunHppId: isJasa ? null : resolveAkun(row['Akun HPP']),
            },
          });
          result.created++;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            result.errors.push({ row: xlsRow, message: `Kode "${kode}" sudah ada` });
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
    const rows = await this.list({ onlyActive: false });
    return this.excel.buildBuffer(
      'Items',
      [
        { header: 'Kode', key: 'kode', width: 14, value: (r) => r.kode },
        { header: 'Nama', key: 'nama', width: 36, value: (r) => r.nama },
        { header: 'Kategori', key: 'kategori', width: 16, value: (r) => r.kategori ?? '' },
        { header: 'Satuan', key: 'satuan', width: 10, value: (r) => r.satuan },
        { header: 'Harga Jual', key: 'hargaJual', width: 14, format: 'currency',
          value: (r) => r.hargaJualDefault },
        { header: 'Klasifikasi PPN', key: 'klasifikasiPpn', width: 16,
          value: (r) => r.klasifikasiPpn },
        { header: 'Jasa', key: 'isJasa', width: 8, value: (r) => (r.isJasa ? 'Ya' : '') },
        { header: 'Akun Pendapatan', key: 'akunPendapatan', width: 24,
          value: (r) => r.akunPendapatan ? `${r.akunPendapatan.kode} ${r.akunPendapatan.nama}` : '' },
        { header: 'Akun Persediaan', key: 'akunPersediaan', width: 24,
          value: (r) => r.akunPersediaan ? `${r.akunPersediaan.kode} ${r.akunPersediaan.nama}` : '' },
        { header: 'Akun HPP', key: 'akunHpp', width: 24,
          value: (r) => r.akunHpp ? `${r.akunHpp.kode} ${r.akunHpp.nama}` : '' },
        { header: 'Aktif', key: 'isAktif', width: 8, value: (r) => (r.isAktif ? 'Ya' : 'Tidak') },
      ],
      rows,
    );
  }
}
