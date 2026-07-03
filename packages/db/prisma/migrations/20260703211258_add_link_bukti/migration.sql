-- AlterTable
ALTER TABLE "journals"          ADD COLUMN "link_bukti" TEXT;
ALTER TABLE "sales_invoices"    ADD COLUMN "link_bukti" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN "link_bukti" TEXT;
ALTER TABLE "cash_bank_entries" ADD COLUMN "link_bukti" TEXT;
