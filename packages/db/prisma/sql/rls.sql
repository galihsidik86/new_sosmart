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

-- ---------- GL CONFIG (akun default per-tenant)
ALTER TABLE gl_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gl_config_isolation ON gl_config;
CREATE POLICY gl_config_isolation ON gl_config
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- AUDIT LOGS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant());

-- ---------- PPh 23 Tarif (referensi jenis jasa per PMK 141/2015)
ALTER TABLE pph23_tarif ENABLE ROW LEVEL SECURITY;
ALTER TABLE pph23_tarif FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pph23_tarif_isolation ON pph23_tarif;
CREATE POLICY pph23_tarif_isolation ON pph23_tarif
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- PROJECTS / PROJECT MEMBERS / BUDGETS (Fase A → D-F)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_isolation ON projects;
CREATE POLICY projects_isolation ON projects
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- project_members tidak punya tenant_id sendiri; isolasi via join ke projects.
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_members_isolation ON project_members;
CREATE POLICY project_members_isolation ON project_members
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_members.project_id
        AND p.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_members.project_id
        AND p.tenant_id = app_current_tenant()
    )
  );

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_isolation ON budgets;
CREATE POLICY budgets_isolation ON budgets
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- SALDO AWAL TERINTEGRASI (Fase 9)
ALTER TABLE saldo_awal ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldo_awal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saldo_awal_isolation ON saldo_awal;
CREATE POLICY saldo_awal_isolation ON saldo_awal
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE saldo_awal_akun_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldo_awal_akun_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saldo_awal_akun_lines_isolation ON saldo_awal_akun_lines;
CREATE POLICY saldo_awal_akun_lines_isolation ON saldo_awal_akun_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- MASTER JENIS INDUSTRI
ALTER TABLE industri ENABLE ROW LEVEL SECURITY;
ALTER TABLE industri FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industri_isolation ON industri;
CREATE POLICY industri_isolation ON industri
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- REKONSILIASI BANK
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_reconciliations_isolation ON bank_reconciliations;
CREATE POLICY bank_reconciliations_isolation ON bank_reconciliations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE bank_reconciliation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_reconciliation_lines_isolation ON bank_reconciliation_lines;
CREATE POLICY bank_reconciliation_lines_isolation ON bank_reconciliation_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- APPROVAL BERJENJANG
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_rules_isolation ON approval_rules;
CREATE POLICY approval_rules_isolation ON approval_rules
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE approval_rule_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rule_steps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_rule_steps_isolation ON approval_rule_steps;
CREATE POLICY approval_rule_steps_isolation ON approval_rule_steps
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_isolation ON approval_requests;
CREATE POLICY approval_requests_isolation ON approval_requests
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_actions_isolation ON approval_actions;
CREATE POLICY approval_actions_isolation ON approval_actions
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- KONSOLIDASI GRUP (dimiliki tenant induk)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS groups_isolation ON groups;
CREATE POLICY groups_isolation ON groups
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_members_isolation ON group_members;
CREATE POLICY group_members_isolation ON group_members
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- MASTER TERMIN PEMBAYARAN
ALTER TABLE term_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_pembayaran FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS term_pembayaran_isolation ON term_pembayaran;
CREATE POLICY term_pembayaran_isolation ON term_pembayaran
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- MASTER JENIS PELANGGAN
ALTER TABLE jenis_pelanggan ENABLE ROW LEVEL SECURITY;
ALTER TABLE jenis_pelanggan FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jenis_pelanggan_isolation ON jenis_pelanggan;
CREATE POLICY jenis_pelanggan_isolation ON jenis_pelanggan
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---------- TUGAS PROJECT
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_tasks_isolation ON project_tasks;
CREATE POLICY project_tasks_isolation ON project_tasks
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- =============================================================
-- Verifikasi:
--   SELECT tablename, rowsecurity, forcerowsecurity
--     FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- =============================================================
