-- =============================================================
-- Row-Level Security (RLS) untuk Lentera
-- Diterapkan SETELAH `prisma migrate dev` selesai (skema sudah ada).
-- Jalankan: psql "$DATABASE_URL" -f packages/db/prisma/sql/rls.sql
--
-- Dua GUC session yang dibaca policy:
--   * `app.tenant_id` — di-set TenancyService.run() untuk request ber-tenant
--   * `app.user_id`   — di-set selalu setelah JWT divalidasi
--                       (dipakai cross-tenant query seperti /tenants/me)
--
-- App runtime pakai user `lentera_app` (non-superuser, RLS aktif).
-- Migrasi & seed pakai user `lentera` (superuser, bypass RLS otomatis).
-- =============================================================

-- ---------- helper functions
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.tenant_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.user_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
END;
$$;

-- ---------- TENANTS
-- SELECT: tenant aktif OR tenant yang user-nya jadi member (untuk picker)
-- INSERT/UPDATE: hanya tenant aktif (tidak boleh modifikasi tenant lain)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_select ON tenants;
DROP POLICY IF EXISTS tenants_modify ON tenants;
CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (
    id = app_current_tenant()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = tenants.id AND m.user_id = app_current_user()
    )
  );
CREATE POLICY tenants_modify ON tenants
  FOR ALL
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

-- ---------- MEMBERSHIPS
-- SELECT: baris milik user OR baris di tenant aktif
-- INSERT/UPDATE: hanya tenant aktif (untuk invite/role change)
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_select ON memberships;
DROP POLICY IF EXISTS memberships_modify ON memberships;
CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (user_id = app_current_user() OR tenant_id = app_current_tenant());
CREATE POLICY memberships_modify ON memberships
  FOR ALL
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE membership_cabang ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_cabang FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_cabang_select ON membership_cabang;
DROP POLICY IF EXISTS membership_cabang_modify ON membership_cabang;
CREATE POLICY membership_cabang_select ON membership_cabang FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = membership_cabang.membership_id
      AND (m.user_id = app_current_user() OR m.tenant_id = app_current_tenant())
  ));
CREATE POLICY membership_cabang_modify ON membership_cabang
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = membership_cabang.membership_id
      AND m.tenant_id = app_current_tenant()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = membership_cabang.membership_id
      AND m.tenant_id = app_current_tenant()
  ));

-- ---------- CABANG (full tenant isolation)
ALTER TABLE cabang ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabang FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cabang_isolation ON cabang;
CREATE POLICY cabang_isolation ON cabang
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- ACCOUNTS (COA)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_isolation ON accounts;
CREATE POLICY accounts_isolation ON accounts
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- TAX RATES
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_rates_isolation ON tax_rates;
CREATE POLICY tax_rates_isolation ON tax_rates
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- ITEMS (master barang)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS items_isolation ON items;
CREATE POLICY items_isolation ON items
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE item_stok_awal ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_stok_awal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_stok_awal_isolation ON item_stok_awal;
CREATE POLICY item_stok_awal_isolation ON item_stok_awal
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- VENDORS & CUSTOMERS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_isolation ON vendors;
CREATE POLICY vendors_isolation ON vendors
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_isolation ON customers;
CREATE POLICY customers_isolation ON customers
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- FISCAL YEARS & PERIODS
ALTER TABLE fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_years FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiscal_years_isolation ON fiscal_years;
CREATE POLICY fiscal_years_isolation ON fiscal_years
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiscal_periods_isolation ON fiscal_periods;
CREATE POLICY fiscal_periods_isolation ON fiscal_periods
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- JOURNALS, JOURNAL_LINES, SEQUENCES (Fase 3 — GL engine)
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journals_isolation ON journals;
CREATE POLICY journals_isolation ON journals
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_lines_isolation ON journal_lines;
CREATE POLICY journal_lines_isolation ON journal_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequences_isolation ON sequences;
CREATE POLICY sequences_isolation ON sequences
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- TRANSAKSI (Fase 4): sales/purchase invoices + cash/bank
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_invoices_isolation ON sales_invoices;
CREATE POLICY sales_invoices_isolation ON sales_invoices
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_invoice_lines_isolation ON sales_invoice_lines;
CREATE POLICY sales_invoice_lines_isolation ON sales_invoice_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_invoices_isolation ON purchase_invoices;
CREATE POLICY purchase_invoices_isolation ON purchase_invoices
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_invoice_lines_isolation ON purchase_invoice_lines;
CREATE POLICY purchase_invoice_lines_isolation ON purchase_invoice_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE cash_bank_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_bank_entries_isolation ON cash_bank_entries;
CREATE POLICY cash_bank_entries_isolation ON cash_bank_entries
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE cash_bank_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_entry_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_bank_entry_lines_isolation ON cash_bank_entry_lines;
CREATE POLICY cash_bank_entry_lines_isolation ON cash_bank_entry_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- INVENTORY (Fase 5)
ALTER TABLE stok_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stok_movements_isolation ON stok_movements;
CREATE POLICY stok_movements_isolation ON stok_movements
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE stok_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_lots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stok_lots_isolation ON stok_lots;
CREATE POLICY stok_lots_isolation ON stok_lots
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE stok_lot_konsumsi ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_lot_konsumsi FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stok_lot_konsumsi_isolation ON stok_lot_konsumsi;
CREATE POLICY stok_lot_konsumsi_isolation ON stok_lot_konsumsi
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE stok_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stok_adjustments_isolation ON stok_adjustments;
CREATE POLICY stok_adjustments_isolation ON stok_adjustments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE stok_adjustment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_adjustment_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stok_adjustment_lines_isolation ON stok_adjustment_lines;
CREATE POLICY stok_adjustment_lines_isolation ON stok_adjustment_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- ASET TETAP (Fase 6)
ALTER TABLE aset_tetap ENABLE ROW LEVEL SECURITY;
ALTER TABLE aset_tetap FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aset_tetap_isolation ON aset_tetap;
CREATE POLICY aset_tetap_isolation ON aset_tetap
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE depresiasi_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE depresiasi_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS depresiasi_runs_isolation ON depresiasi_runs;
CREATE POLICY depresiasi_runs_isolation ON depresiasi_runs
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE depresiasi_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE depresiasi_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS depresiasi_lines_isolation ON depresiasi_lines;
CREATE POLICY depresiasi_lines_isolation ON depresiasi_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- PAJAK (Fase 7): karyawan, payroll, bukti potong
ALTER TABLE karyawan ENABLE ROW LEVEL SECURITY;
ALTER TABLE karyawan FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS karyawan_isolation ON karyawan;
CREATE POLICY karyawan_isolation ON karyawan
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_runs_isolation ON payroll_runs;
CREATE POLICY payroll_runs_isolation ON payroll_runs
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_lines_isolation ON payroll_lines;
CREATE POLICY payroll_lines_isolation ON payroll_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE bukti_potong ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_potong FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bukti_potong_isolation ON bukti_potong;
CREATE POLICY bukti_potong_isolation ON bukti_potong
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- AUDIT LOGS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant());

-- =============================================================
-- Verifikasi:
--   SELECT tablename, rowsecurity, forcerowsecurity
--     FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- =============================================================
