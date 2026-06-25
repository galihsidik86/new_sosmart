-- =============================================================
-- GL invariants (Fase 3)
-- Jalankan SETELAH prisma migrate yang membuat tabel journals/journal_lines.
--   psql "$DATABASE_URL" -f packages/db/prisma/sql/gl-constraints.sql
--
-- Filosofi: invariant fundamental akuntansi DIPAKSAKAN di DB level
-- supaya bug aplikasi tidak bisa menghasilkan ledger yang tidak balance.
-- =============================================================

-- ---------- per JournalLine: non-negative & XOR (debit OR kredit)
ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_debit_nonneg;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_debit_nonneg CHECK (debit >= 0);

ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_kredit_nonneg;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_kredit_nonneg CHECK (kredit >= 0);

ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_xor;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_xor
  CHECK (
    (debit > 0 AND kredit = 0) OR (debit = 0 AND kredit > 0)
  );

-- ---------- per Journal: total D=K, dan POSTED harus punya nomor
ALTER TABLE journals
  DROP CONSTRAINT IF EXISTS journals_totals_balance;
ALTER TABLE journals
  ADD CONSTRAINT journals_totals_balance
  CHECK (total_debit = total_kredit);

ALTER TABLE journals
  DROP CONSTRAINT IF EXISTS journals_posted_has_nomor;
ALTER TABLE journals
  ADD CONSTRAINT journals_posted_has_nomor
  CHECK (
    status = 'DRAFT' OR (nomor IS NOT NULL AND posted_at IS NOT NULL)
  );

-- ---------- TRIGGER: kalau journal POSTED, total_debit / total_kredit
-- harus konsisten dengan SUM dari journal_lines. Dijalankan AFTER
-- INSERT/UPDATE/DELETE pada journal_lines.
CREATE OR REPLACE FUNCTION journal_assert_balance() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  jid uuid;
  s text;
  sumd numeric;
  sumk numeric;
  td numeric;
  tk numeric;
BEGIN
  jid := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT status, total_debit, total_kredit INTO s, td, tk
    FROM journals WHERE id = jid;
  IF s IS NULL OR s = 'DRAFT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(kredit), 0)
    INTO sumd, sumk
    FROM journal_lines WHERE journal_id = jid;
  IF sumd <> td OR sumk <> tk THEN
    RAISE EXCEPTION 'journal %: totals mismatch (lines D=%, K=% vs header D=%, K=%)',
      jid, sumd, sumk, td, tk;
  END IF;
  IF sumd <> sumk THEN
    RAISE EXCEPTION 'journal %: not balanced (D=%, K=%)', jid, sumd, sumk;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_assert_balance();

-- ---------- TRIGGER: hanya akun postable yang boleh muncul di line.
CREATE OR REPLACE FUNCTION journal_line_account_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  ok boolean;
BEGIN
  SELECT (is_postable AND is_active) INTO ok
    FROM accounts WHERE id = NEW.account_id;
  IF NOT FOUND OR NOT ok THEN
    RAISE EXCEPTION 'account % bukan akun postable yang aktif', NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_line_account_check ON journal_lines;
CREATE TRIGGER trg_journal_line_account_check
  BEFORE INSERT OR UPDATE OF account_id ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_line_account_check();

-- =============================================================
-- INVENTORY invariants (Fase 5)
-- =============================================================

ALTER TABLE stok_movements
  DROP CONSTRAINT IF EXISTS stok_movements_qty_xor;
ALTER TABLE stok_movements
  ADD CONSTRAINT stok_movements_qty_xor
  CHECK (
    (qty_in > 0 AND qty_out = 0) OR (qty_in = 0 AND qty_out > 0)
  );

ALTER TABLE stok_movements
  DROP CONSTRAINT IF EXISTS stok_movements_qty_nonneg;
ALTER TABLE stok_movements
  ADD CONSTRAINT stok_movements_qty_nonneg
  CHECK (qty_in >= 0 AND qty_out >= 0);

ALTER TABLE stok_lots
  DROP CONSTRAINT IF EXISTS stok_lots_qty_valid;
ALTER TABLE stok_lots
  ADD CONSTRAINT stok_lots_qty_valid
  CHECK (qty_masuk > 0 AND qty_terpakai >= 0 AND qty_terpakai <= qty_masuk);

-- =============================================================
-- Verifikasi:
--   \d+ journals
--   \d+ journal_lines
-- =============================================================
