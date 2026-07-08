-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "idempotency_key" UUID;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "idempotency_key" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_tenant_id_idempotency_key_key" ON "purchase_invoices"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenant_id_idempotency_key_key" ON "sales_invoices"("tenant_id", "idempotency_key");
