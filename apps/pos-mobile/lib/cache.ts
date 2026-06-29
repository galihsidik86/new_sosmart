/**
 * Refresh + baca cache items / customers / accounts.
 * Strategi: replace-all per refresh (data master kecil, simpler ketimbang diff).
 */
import { getDb } from './db';
import { apiFetch } from './api';
import type { Item } from './cart';

export interface Customer {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  alamat: string | null;
  isAktif: boolean;
  akunPiutangId: string | null;
}

export interface Account {
  id: string;
  kode: string;
  nama: string;
  kind: string;
  isPostable: boolean;
}

async function replaceAll<T extends { id: string }>(table: string, rows: T[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync(`DELETE FROM ${table};`);
    const now = Date.now();
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO ${table} (id, json, updated_at) VALUES (?, ?, ?)`,
        [r.id, JSON.stringify(r), now],
      );
    }
  });
}

async function listAll<T>(table: string): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(`SELECT json FROM ${table}`);
  return rows.map((r) => JSON.parse(r.json) as T);
}

export async function refreshItems(): Promise<number> {
  const items = await apiFetch<Item[]>('/items');
  await replaceAll('items_cache', items);
  return items.length;
}

export async function cachedItems(): Promise<Item[]> {
  return listAll<Item>('items_cache');
}

export async function refreshCustomers(): Promise<number> {
  const cs = await apiFetch<Customer[]>('/customers');
  await replaceAll('customers_cache', cs);
  return cs.length;
}

export async function cachedCustomers(): Promise<Customer[]> {
  return listAll<Customer>('customers_cache');
}

export async function refreshAccounts(): Promise<number> {
  // Hanya akun postable kas/bank (1-101..1-103-an) yang relevan utk POS.
  // /accounts?view=flat balikin semua, di sini filter prefix kode.
  const all = await apiFetch<Account[]>('/accounts?view=flat');
  const filtered = all.filter(
    (a) => a.isPostable && (a.kode.startsWith('1-101') || a.kode.startsWith('1-102') || a.kode.startsWith('1-103')),
  );
  await replaceAll('accounts_cache', filtered);
  return filtered.length;
}

export async function cachedAccounts(): Promise<Account[]> {
  return listAll<Account>('accounts_cache');
}

export async function refreshAllMaster(): Promise<{ items: number; customers: number; accounts: number }> {
  const [items, customers, accounts] = await Promise.all([
    refreshItems(),
    refreshCustomers(),
    refreshAccounts(),
  ]);
  return { items, customers, accounts };
}
