import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@lentera/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validasi header `x-requested-by-user-id` untuk pola step-up:
 *   - Nilai UUID valid (kalau tidak → BadRequest, cegah injection lewat header)
 *   - Berbeda dari approver (kalau sama → return null, header meaningless)
 *   - Requester adalah anggota tenant yang sama
 *
 * Return: requesterId yang valid untuk audit, atau null kalau header tidak
 * dipakai (empty / == approver).
 *
 * PENTING: audit trail lewat header ini adalah **hint**, bukan security
 * boundary. Approver bebas mengisi apapun; nilai ini disimpan untuk
 * ketertelusuran ("KASIR X minta AKUNTAN Y post"), bukan untuk otorisasi.
 */
export async function validateRequestedBy(
  tx: Prisma.TransactionClient,
  approverUserId: string,
  approverTenantId: string,
  requestedById: string | null | undefined,
): Promise<string | null> {
  if (!requestedById) return null;
  if (!UUID_RE.test(requestedById)) {
    throw new BadRequestException('Header x-requested-by-user-id bukan UUID valid');
  }
  if (requestedById === approverUserId) return null;
  const m = await tx.membership.findUnique({
    where: { userId_tenantId: { userId: requestedById, tenantId: approverTenantId } },
    select: { userId: true },
  });
  if (!m) {
    throw new BadRequestException(
      'Requester (x-requested-by-user-id) bukan anggota tenant',
    );
  }
  return requestedById;
}
