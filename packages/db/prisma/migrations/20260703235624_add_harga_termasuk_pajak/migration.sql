-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "harga_termasuk_pajak" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "harga_termasuk_pajak" BOOLEAN NOT NULL DEFAULT false;
