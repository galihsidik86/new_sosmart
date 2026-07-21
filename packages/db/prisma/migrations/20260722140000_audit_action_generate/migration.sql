-- Tambah nilai enum GENERATE untuk audit trail generate laporan (konsolidasi).
-- ADD VALUE aman di Postgres 12+ (nilai baru tak dipakai di migrasi ini).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GENERATE';
