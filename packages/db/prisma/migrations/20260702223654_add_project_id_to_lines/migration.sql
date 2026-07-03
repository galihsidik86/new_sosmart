-- AlterTable
ALTER TABLE "cash_bank_entry_lines" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "purchase_invoice_lines" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "sales_invoice_lines" ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "cash_bank_entry_lines_project_id_idx" ON "cash_bank_entry_lines"("project_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_project_id_idx" ON "purchase_invoice_lines"("project_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_project_id_idx" ON "sales_invoice_lines"("project_id");

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_entry_lines" ADD CONSTRAINT "cash_bank_entry_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
