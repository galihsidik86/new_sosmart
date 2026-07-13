-- PPh 23 dipotong pelanggan saat pelunasan piutang JKP (Opsi A — di penerimaan kas/bank)
ALTER TABLE "cash_bank_entries"
  ADD COLUMN "pph23_dipotong" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "no_bukti_potong" TEXT;
