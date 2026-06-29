-- AlterTable
ALTER TABLE "cash_bank_entries" ADD COLUMN     "cancelled_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "depresiasi_runs" ADD COLUMN     "cancelled_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "cancelled_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "cancelled_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "cancelled_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "stok_adjustments" ADD COLUMN     "cancelled_requested_by_id" UUID;
