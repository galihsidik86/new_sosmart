import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { JournalStatus, Prisma } from '@lentera/db';
import { TenancyService } from '../../common/tenancy/tenancy.service.js';
import { TenantContext } from '../../common/tenancy/tenant-context.js';

export interface CreateReconInput {
  akunId: string;
  /** Tanggal cut-off / rekening koran (YYYY-MM-DD). */
  tanggal: string;
  saldoRekeningKoran: string;
  catatan?: string;
}

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly ctx: TenantContext,
  ) {}

  /** Daftar rekonsiliasi (terbaru dulu). */
  list() {
    return this.tenancy.run((tx) =>
      tx.bankReconciliation.findMany({
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        include: {
          akun: { select: { kode: true, nama: true } },
          _count: { select: { lines: true } },
        },
      }),
    );
  }

  /** Akun kas/bank yang boleh direkonsiliasi (isKasSetara & postable). */
  akunKasBank() {
    return this.tenancy.run((tx) =>
      tx.account.findMany({
        where: { isKasSetara: true, isPostable: true, isActive: true },
        select: { id: true, kode: true, nama: true },
        orderBy: { kode: 'asc' },
      }),
    );
  }

  async create(input: CreateReconInput) {
    const tenantId = this.ctx.require().tenantId;
    const userId = this.ctx.require().userId;
    const tanggal = new Date(input.tanggal + 'T00:00:00Z');
    if (Number.isNaN(tanggal.getTime())) {
      throw new BadRequestException('Tanggal tidak valid');
    }
    return this.tenancy.run(async (tx) => {
      const akun = await tx.account.findUnique({
        where: { id: input.akunId },
        select: { id: true, isKasSetara: true, isPostable: true },
      });
      if (!akun) throw new BadRequestException('Akun tidak ditemukan');
      if (!akun.isKasSetara || !akun.isPostable) {
        throw new BadRequestException(
          'Akun harus akun kas/bank (setara kas) yang postable. Tandai "Kas & setara kas" di Bagan Akun.',
        );
      }
      // Cegah >1 rekonsiliasi DRAFT untuk akun yang sama (hindari klaim ganda
      // atas baris jurnal yang sama).
      const draftAda = await tx.bankReconciliation.findFirst({
        where: { akunId: input.akunId, status: 'DRAFT' },
        select: { id: true },
      });
      if (draftAda) {
        throw new BadRequestException(
          'Sudah ada rekonsiliasi DRAFT untuk akun ini — selesaikan atau hapus dulu.',
        );
      }
      return tx.bankReconciliation.create({
        data: {
          tenantId,
          akunId: input.akunId,
          tanggal,
          saldoRekeningKoran: new Decimal(input.saldoRekeningKoran).toFixed(2),
          catatan: input.catatan?.trim() || null,
          createdById: userId,
        },
      });
    });
  }

  /** Header + worksheet (baris jurnal + ringkasan terhitung). */
  detail(id: string) {
    return this.tenancy.run((tx) => this.buildWorksheet(tx, id));
  }

  /** Hitung worksheet dalam tx yang diberikan (dipakai detail() & finalize()). */
  private async buildWorksheet(tx: Prisma.TransactionClient, id: string) {
      const recon = await tx.bankReconciliation.findUnique({
        where: { id },
        include: { akun: { select: { id: true, kode: true, nama: true, saldoAwal: true } } },
      });
      if (!recon) throw new NotFoundException('Rekonsiliasi tidak ditemukan');

      const akunId = recon.akunId;
      const cutoff = recon.tanggal;

      // Saldo buku (GL) = saldo awal akun + Σ(debit−kredit) POSTED s/d cut-off.
      const agg = await tx.journalLine.aggregate({
        where: {
          accountId: akunId,
          journal: { status: JournalStatus.POSTED, tanggal: { lte: cutoff } },
        },
        _sum: { debit: true, kredit: true },
      });
      const saldoBuku = new Decimal(recon.akun.saldoAwal)
        .plus(new Decimal(agg._sum.debit ?? 0))
        .minus(new Decimal(agg._sum.kredit ?? 0));

      // Baris jurnal kandidat: POSTED, s/d cut-off, belum di-clear di rekonsiliasi
      // LAIN (baris yang sudah di-clear di rekonsiliasi ini tetap tampil = ✓).
      const rows = await tx.journalLine.findMany({
        where: {
          accountId: akunId,
          journal: { status: JournalStatus.POSTED, tanggal: { lte: cutoff } },
          OR: [{ bankReconLine: null }, { bankReconLine: { reconciliationId: id } }],
        },
        select: {
          id: true, debit: true, kredit: true, deskripsi: true,
          journal: { select: { nomor: true, tanggal: true, deskripsi: true } },
          bankReconLine: { select: { reconciliationId: true } },
        },
        orderBy: [{ journal: { tanggal: 'asc' } }, { no: 'asc' }],
      });

      let clearedNet = new Decimal(0);
      let outSetoran = new Decimal(0);   // uncleared debit → setoran dalam perjalanan
      let outPembayaran = new Decimal(0); // uncleared kredit → pembayaran belum kliring
      const lines = rows.map((l) => {
        const debit = new Decimal(l.debit);
        const kredit = new Decimal(l.kredit);
        const cleared = l.bankReconLine?.reconciliationId === id;
        if (cleared) {
          clearedNet = clearedNet.plus(debit).minus(kredit);
        } else {
          outSetoran = outSetoran.plus(debit);
          outPembayaran = outPembayaran.plus(kredit);
        }
        return {
          journalLineId: l.id,
          nomor: l.journal.nomor,
          tanggal: l.journal.tanggal,
          keterangan: l.deskripsi || l.journal.deskripsi,
          debit: debit.toFixed(2),
          kredit: kredit.toFixed(2),
          cleared,
        };
      });

      const saldoRekeningKoran = new Decimal(recon.saldoRekeningKoran);
      // Bank disesuaikan = saldo rekening koran + setoran dalam perjalanan
      //                    − pembayaran belum kliring. Harus = saldo buku.
      const bankDisesuaikan = saldoRekeningKoran.plus(outSetoran).minus(outPembayaran);
      const selisih = saldoBuku.minus(bankDisesuaikan);

      return {
        id: recon.id,
        akun: { id: recon.akun.id, kode: recon.akun.kode, nama: recon.akun.nama },
        tanggal: recon.tanggal,
        status: recon.status,
        catatan: recon.catatan,
        saldoRekeningKoran: saldoRekeningKoran.toFixed(2),
        saldoBuku: saldoBuku.toFixed(2),
        outstandingSetoran: outSetoran.toFixed(2),
        outstandingPembayaran: outPembayaran.toFixed(2),
        bankDisesuaikan: bankDisesuaikan.toFixed(2),
        selisih: selisih.toFixed(2),
        clearedNet: clearedNet.toFixed(2),
        lines,
      };
  }

  /** Tandai / lepas tanda "cleared" untuk sebuah baris jurnal. */
  async toggle(id: string, journalLineId: string, cleared: boolean) {
    const tenantId = this.ctx.require().tenantId;
    return this.tenancy.run(async (tx) => {
      const recon = await tx.bankReconciliation.findUnique({ where: { id } });
      if (!recon) throw new NotFoundException('Rekonsiliasi tidak ditemukan');
      if (recon.status !== 'DRAFT') {
        throw new BadRequestException('Rekonsiliasi sudah SELESAI — buka kembali dulu untuk mengubah.');
      }
      const line = await tx.journalLine.findUnique({
        where: { id: journalLineId },
        select: {
          accountId: true,
          journal: { select: { status: true, tanggal: true } },
          bankReconLine: { select: { id: true, reconciliationId: true } },
        },
      });
      if (!line) throw new NotFoundException('Baris jurnal tidak ditemukan');
      if (line.accountId !== recon.akunId) {
        throw new BadRequestException('Baris jurnal bukan milik akun ini');
      }
      if (line.journal.status !== JournalStatus.POSTED || line.journal.tanggal > recon.tanggal) {
        throw new BadRequestException('Baris jurnal di luar cakupan rekonsiliasi');
      }

      if (cleared) {
        if (line.bankReconLine && line.bankReconLine.reconciliationId !== id) {
          throw new BadRequestException('Baris ini sudah dicocokkan di rekonsiliasi lain');
        }
        if (!line.bankReconLine) {
          await tx.bankReconciliationLine.create({
            data: { tenantId, reconciliationId: id, journalLineId },
          });
        }
      } else if (line.bankReconLine?.reconciliationId === id) {
        await tx.bankReconciliationLine.delete({ where: { id: line.bankReconLine.id } });
      }
      return { ok: true };
    });
  }

  /** Finalize — wajib seimbang (selisih ≈ 0). */
  async finalize(id: string, catatan?: string) {
    return this.tenancy.run(async (tx) => {
      const d = await this.buildWorksheet(tx, id);
      if (d.status !== 'DRAFT') {
        throw new BadRequestException('Rekonsiliasi sudah SELESAI');
      }
      if (new Decimal(d.selisih).abs().gt(new Decimal('0.5'))) {
        throw new BadRequestException(
          `Belum seimbang — selisih Rp ${new Decimal(d.selisih).toFixed(2)}. ` +
          'Centang semua transaksi yang sudah muncul di rekening koran, dan catat ' +
          'jurnal penyesuaian (biaya admin bank / jasa giro) sebelum finalize.',
        );
      }
      await tx.bankReconciliation.update({
        where: { id },
        data: {
          status: 'SELESAI',
          saldoBuku: d.saldoBuku,
          selisih: d.selisih,
          catatan: catatan?.trim() || undefined,
          finalizedAt: new Date(),
        },
      });
      return { ok: true };
    });
  }

  /** Buka kembali rekonsiliasi SELESAI untuk koreksi. */
  async reopen(id: string) {
    return this.tenancy.run(async (tx) => {
      const recon = await tx.bankReconciliation.findUnique({ where: { id }, select: { status: true } });
      if (!recon) throw new NotFoundException('Rekonsiliasi tidak ditemukan');
      if (recon.status !== 'SELESAI') throw new BadRequestException('Rekonsiliasi bukan SELESAI');
      await tx.bankReconciliation.update({
        where: { id },
        data: { status: 'DRAFT', finalizedAt: null },
      });
      return { ok: true };
    });
  }

  /** Hapus rekonsiliasi DRAFT (melepas semua tanda cleared-nya via cascade). */
  async remove(id: string) {
    return this.tenancy.run(async (tx) => {
      const recon = await tx.bankReconciliation.findUnique({ where: { id }, select: { status: true } });
      if (!recon) throw new NotFoundException('Rekonsiliasi tidak ditemukan');
      if (recon.status !== 'DRAFT') {
        throw new BadRequestException('Hanya rekonsiliasi DRAFT yang bisa dihapus — buka kembali dulu.');
      }
      await tx.bankReconciliation.delete({ where: { id } });
      return { removed: true };
    });
  }
}
