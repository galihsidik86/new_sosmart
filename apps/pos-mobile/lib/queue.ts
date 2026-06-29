/**
 * Antrian penjualan offline.
 *
 * Lifecycle:
 *   pending → (POST /sales-invoices)
 *   created → (POST /sales-invoices/:id/post)
 *   synced (POSTED di server)
 *   failed (catat error, manual retry)
 */
import * as Network from 'expo-network';
import { getDb } from './db';
import { apiFetch, ApiError } from './api';

export interface SaleSubmitPayload {
  /** Konten body untuk POST /sales-invoices */
  body: {
    tanggal: string;
    jatuhTempo: string;
    termin: 'TUNAI' | 'KREDIT';
    cabangId: string;
    customerId: string;
    akunArId: string;
    tarifPpnPersen: number;
    lines: Array<{
      itemId: string;
      deskripsi: string;
      qty: string;
      satuan: string;
      hargaSatuan: string;
      diskonPersen: string;
      klasifikasiPpn: string;
      akunPendapatanId: string;
    }>;
  };
  /** Untuk struk: rekap snapshot yg kita simpan supaya cetak ulang gampang. */
  receiptSnapshot: {
    customerNama: string;
    kasirNama: string;
    cabangKode: string;
    cabangNama: string;
    tenantNama: string;
    bayar: number;
    kembalian: number;
    paper: '58mm' | '80mm';
  };
}

export interface PendingRow {
  id: string;
  payload: SaleSubmitPayload;
  status: 'pending' | 'created' | 'synced' | 'failed';
  serverId: string | null;
  serverNomor: string | null;
  error: string | null;
  attempts: number;
  createdAt: number;
}

function uuid(): string {
  // Hindari dep tambahan; cukup random hex 16 byte.
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export async function enqueueSale(payload: SaleSubmitPayload): Promise<string> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO pending_sales (id, payload, status, attempts, created_at)
     VALUES (?, ?, 'pending', 0, ?)`,
    [id, JSON.stringify(payload), Date.now()],
  );
  return id;
}

function rowToPending(r: {
  id: string;
  payload: string;
  status: string;
  server_id: string | null;
  server_nomor: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
}): PendingRow {
  return {
    id: r.id,
    payload: JSON.parse(r.payload) as SaleSubmitPayload,
    status: r.status as PendingRow['status'],
    serverId: r.server_id,
    serverNomor: r.server_nomor,
    error: r.error,
    attempts: r.attempts,
    createdAt: r.created_at,
  };
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM pending_sales WHERE status IN ('pending','created','failed')`,
  );
  return r?.c ?? 0;
}

export async function listAllSales(): Promise<PendingRow[]> {
  const db = await getDb();
  type Row = {
    id: string;
    payload: string;
    status: string;
    server_id: string | null;
    server_nomor: string | null;
    error: string | null;
    attempts: number;
    created_at: number;
  };
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM pending_sales ORDER BY created_at DESC LIMIT 100`,
  );
  return rows.map(rowToPending);
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isInternetReachable;
  } catch {
    return false;
  }
}

/**
 * Coba sync semua row yang belum synced. Best-effort:
 * - 'pending'  → POST /sales-invoices  →  status='created', serverId
 * - 'created'  → POST /sales-invoices/:id/post  →  status='synced', serverNomor
 * - 'failed'   → coba retry juga (mungkin error transient)
 *
 * Tidak melempar; setiap row gagal ditandai sendiri.
 */
export async function syncOnce(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  if (!(await isOnline())) {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }
  const db = await getDb();
  type Row = {
    id: string;
    payload: string;
    status: string;
    server_id: string | null;
    server_nomor: string | null;
    error: string | null;
    attempts: number;
    created_at: number;
  };
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM pending_sales WHERE status IN ('pending','created','failed') ORDER BY created_at ASC`,
  );
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  for (const r of rows) {
    const row = rowToPending(r);
    attempted++;
    try {
      let serverId = row.serverId;
      if (row.status === 'pending' || row.status === 'failed') {
        const created = await apiFetch<{ id: string }>('/sales-invoices', {
          method: 'POST',
          body: row.payload.body,
        });
        serverId = created.id;
        await db.runAsync(
          `UPDATE pending_sales SET status='created', server_id=?, attempts=attempts+1, error=NULL WHERE id=?`,
          [serverId, row.id],
        );
      }
      // Lanjut post
      if (!serverId) throw new Error('Tidak punya server_id untuk post');
      const posted = await apiFetch<{ nomor: string }>(
        `/sales-invoices/${serverId}/post`,
        { method: 'POST' },
      );
      await db.runAsync(
        `UPDATE pending_sales SET status='synced', server_nomor=?, attempts=attempts+1, error=NULL WHERE id=?`,
        [posted.nomor ?? null, row.id],
      );
      succeeded++;
    } catch (e) {
      failed++;
      const msg = e instanceof ApiError ? `${e.status}: ${e.message}` : String(e);
      await db.runAsync(
        `UPDATE pending_sales SET status='failed', attempts=attempts+1, error=? WHERE id=?`,
        [msg, row.id],
      );
    }
  }
  return { attempted, succeeded, failed };
}
