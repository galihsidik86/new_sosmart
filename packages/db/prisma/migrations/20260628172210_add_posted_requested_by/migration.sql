-- AlterTable
ALTER TABLE "journals" ADD COLUMN     "posted_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "posted_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "posted_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "posted_requested_by_id" UUID;

-- AlterTable
ALTER TABLE "stok_adjustments" ADD COLUMN     "posted_requested_by_id" UUID;
