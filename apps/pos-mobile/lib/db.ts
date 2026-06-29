/**
 * SQLite local store untuk POS:
 *   - cache items/customers/akun supaya app jalan offline
 *   - queue penjualan offline yang akan di-sync ke backend
 *
 * Single connection di-share via openDatabaseAsync. Singleton lewat module.
 */
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('lentera-pos.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS items_cache (
          id TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers_cache (
          id TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS accounts_cache (
          id TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_sales (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending','created','synced','failed')),
          server_id TEXT,
          server_nomor TEXT,
          error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_sales(status);
      `);
      return db;
    })();
  }
  return dbPromise;
}
